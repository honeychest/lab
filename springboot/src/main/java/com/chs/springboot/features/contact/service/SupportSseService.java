// [AGENT] SSE emitter 관리 서비스 — guestToken별 구독/알림 처리
// 연관: ContactController.java, TelegramUpdateProcessor.java
package com.chs.springboot.features.contact.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Server-Sent Events 기반 실시간 답장 알림 서비스.
 * guestToken 단위로 emitter 목록을 관리해 여러 탭에서 동시 구독을 지원한다.
 */
@Slf4j
@Service
public class SupportSseService {

    private static final long TIMEOUT_MS = 30 * 60 * 1000L; // 30분

    /** guestToken → emitter 목록 (탭 여러 개 대응) */
    private final Map<String, List<SseEmitter>> emitters = new ConcurrentHashMap<>();

    /**
     * SSE 구독 — emitter 생성 후 timeout/completion/error 시 자동 제거
     */
    public SseEmitter subscribe(String guestToken) {
        SseEmitter emitter = new SseEmitter(TIMEOUT_MS);

        emitters.computeIfAbsent(guestToken, k -> new CopyOnWriteArrayList<>()).add(emitter);

        Runnable cleanup = () -> {
            List<SseEmitter> list = emitters.get(guestToken);
            if (list != null) {
                list.remove(emitter);
                if (list.isEmpty()) emitters.remove(guestToken);
            }
        };

        emitter.onTimeout(cleanup);
        emitter.onCompletion(cleanup);
        emitter.onError(e -> cleanup.run());

        // 초기 연결 확인 이벤트 (프록시가 빈 스트림을 끊는 것 방지)
        try {
            emitter.send(SseEmitter.event().name("connect").data("ok"));
        } catch (IOException e) {
            cleanup.run();
        }

        log.debug("SSE subscribed guestToken={}", guestToken);
        return emitter;
    }

    /**
     * 답장 알림 전송 — 해당 guestToken의 모든 emitter에 이벤트 전송
     * 실패한 emitter는 즉시 제거
     */
    public void notify(String guestToken) {
        if (guestToken == null) return;
        List<SseEmitter> list = emitters.get(guestToken);
        if (list == null || list.isEmpty()) return;

        List<SseEmitter> dead = new CopyOnWriteArrayList<>();
        for (SseEmitter emitter : list) {
            try {
                emitter.send(SseEmitter.event().name("reply").data("new"));
            } catch (IOException e) {
                dead.add(emitter);
            }
        }
        list.removeAll(dead);
        if (list.isEmpty()) emitters.remove(guestToken);
    }
}
