package com.chs.springboot.domain.binance.service;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.URI;
import java.net.http.WebSocket;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class BinanceWebSocketStreamTest {

    private ScheduledExecutorService scheduler;
    private AtomicInteger connectCount;
    private AtomicReference<WebSocket.Listener> capturedListener;
    private WebSocket mockWs;

    @BeforeEach
    void setUp() {
        scheduler = Executors.newSingleThreadScheduledExecutor();
        connectCount = new AtomicInteger();
        capturedListener = new AtomicReference<>();
        mockWs = mock(WebSocket.class);
    }

    @AfterEach
    void tearDown() {
        scheduler.shutdownNow();
    }

    @Test
    @DisplayName("1006 close 시 onClose+onError 동시 호출되어도 reconnect는 1회만 발생한다")
    void abnormalClose_onCloseAndOnError_reconnectsOnlyOnce() throws Exception {
        BinanceWebSocketStream stream = createStream(1);

        stream.connect();
        Thread.sleep(200);
        assertThat(connectCount.get()).isEqualTo(1);

        WebSocket.Listener listener = capturedListener.get();
        listener.onClose(mockWs, 1006, "abnormal closure");
        listener.onError(mockWs, new IOException("connection reset"));

        Thread.sleep(2500);

        assertThat(connectCount.get()).isEqualTo(2);
    }

    @Test
    @DisplayName("정상 close 후에도 reconnect는 정확히 1회 발생한다")
    void normalClose_reconnectsOnce() throws Exception {
        BinanceWebSocketStream stream = createStream(1);

        stream.connect();
        Thread.sleep(200);

        capturedListener.get().onClose(mockWs, 1001, "going away");

        Thread.sleep(2500);

        assertThat(connectCount.get()).isEqualTo(2);
    }

    @Test
    @DisplayName("disconnect 후에는 reconnect가 발생하지 않는다")
    void disconnect_preventsReconnect() throws Exception {
        BinanceWebSocketStream stream = createStream(1);

        stream.connect();
        Thread.sleep(200);

        stream.disconnect();
        capturedListener.get().onClose(mockWs, 1006, "abnormal closure");

        Thread.sleep(2500);

        assertThat(connectCount.get()).isEqualTo(1);
    }

    private BinanceWebSocketStream createStream(long reconnectDelaySec) {
        BinanceWebSocketStream.WebSocketConnector connector = (uri, listener) -> {
            capturedListener.set(listener);
            connectCount.incrementAndGet();
            listener.onOpen(mockWs);
            return CompletableFuture.completedFuture(mockWs);
        };

        return new BinanceWebSocketStream(
                "wss://test.example.com/ws", "TEST", json -> {},
                scheduler, reconnectDelaySec, connector);
    }
}
