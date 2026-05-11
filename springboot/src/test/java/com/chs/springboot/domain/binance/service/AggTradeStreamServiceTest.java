package com.chs.springboot.domain.binance.service;

import com.chs.springboot.global.redis.LeaderElectionService;
import com.chs.springboot.global.redis.LeadershipChangedEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class AggTradeStreamServiceTest {

    private AggTradeParser parser;
    private List<AggTradeSink> sinks;
    private List<BinanceWebSocketStream> createdStreams;
    private List<BinanceWebSocketStream.MessageListener> capturedListeners;
    private AggTradeStreamService service;

    @BeforeEach
    void setUp() {
        parser = new AggTradeParser(new ObjectMapper());
        sinks = new ArrayList<>();
        createdStreams = new ArrayList<>();
        capturedListeners = new ArrayList<>();
        service = new AggTradeStreamService(parser, sinks,
                (url, logLabel, listener, scheduler, reconnectDelaySeconds) -> {
                    BinanceWebSocketStream stream = mock(BinanceWebSocketStream.class);
                    createdStreams.add(stream);
                    capturedListeners.add(listener);
                    return stream;
                });
    }

    @Test
    @DisplayName("start는 WebSocket을 바로 연결하지 않고 리더 이벤트를 기다린다")
    void start_waitsForLeadershipEvent() {
        service.start();

        assertThat(createdStreams).isEmpty();
    }

    @Test
    @DisplayName("ServerLeader 획득 이벤트에서 4개 stream을 연결한다")
    void onLeadershipChanged_serverLeader_connectsStreams() {
        service.onLeadershipChanged(new LeadershipChangedEvent("server-A", true));

        verifyConnectedStreams(4);
    }

    @Test
    @DisplayName("같은 리더 이벤트가 반복되어도 중복 연결하지 않는다")
    void onLeadershipChanged_duplicateLeaderEvent_doesNotReconnect() {
        LeadershipChangedEvent event = new LeadershipChangedEvent("server-A", true);

        service.onLeadershipChanged(event);
        service.onLeadershipChanged(event);

        verifyConnectedStreams(4);
    }

    @Test
    @DisplayName("ServerLeader 상실 이벤트에서 연결된 stream을 해제한다")
    void onLeadershipChanged_serverLeaderLost_disconnectsStreams() {
        service.onLeadershipChanged(new LeadershipChangedEvent("server-A", true));

        service.onLeadershipChanged(new LeadershipChangedEvent("server-A", false));

        for (BinanceWebSocketStream stream : createdStreams) {
            verify(stream).disconnect();
        }
    }

    @Test
    @DisplayName("메시지 수신 시 등록된 모든 sink에 dispatch 한다")
    void dispatch_callsAllSinks() {
        AtomicInteger counterA = new AtomicInteger();
        AtomicInteger counterB = new AtomicInteger();
        sinks.add(e -> counterA.incrementAndGet());
        sinks.add(e -> counterB.incrementAndGet());

        service.onLeadershipChanged(new LeadershipChangedEvent("server-A", true));
        capturedListeners.get(0).onMessage("{\"a\":1,\"p\":\"1\",\"q\":\"1\",\"m\":false,\"T\":1}");

        assertThat(counterA.get()).isEqualTo(1);
        assertThat(counterB.get()).isEqualTo(1);
    }

    @Test
    @DisplayName("sink 하나가 예외를 던져도 다음 sink는 정상 호출된다 (격리)")
    void dispatch_sinkException_doesNotStopOthers() {
        AtomicInteger downstreamCalls = new AtomicInteger();
        sinks.add(e -> { throw new RuntimeException("boom"); });
        sinks.add(e -> downstreamCalls.incrementAndGet());

        service.onLeadershipChanged(new LeadershipChangedEvent("server-A", true));
        capturedListeners.get(0).onMessage("{\"a\":1,\"p\":\"1\",\"q\":\"1\",\"m\":false,\"T\":1}");

        assertThat(downstreamCalls.get()).isEqualTo(1);
    }

    private void verifyConnectedStreams(int count) {
        assertThat(createdStreams).hasSize(count);
        for (BinanceWebSocketStream stream : createdStreams) {
            verify(stream).connect();
        }
    }
}
