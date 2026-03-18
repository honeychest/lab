// [AGENT] 텔레그램 "수락 {requestId} [ttl]" 파싱 → Redis 허용 IP 등록 + 감사로그 기록
package com.chs.springboot.global.monitor.service;

import com.chs.springboot.global.monitor.entity.IpAuditLog;
import com.chs.springboot.global.telegram.TelegramProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class IpApprovalProcessor {

    private static final Pattern PATTERN = Pattern.compile("^수락\\s+([a-f0-9]{8})(?:\\s+(\\d+)(분|시간))?$");

    private final StringRedisTemplate redisTemplate;
    private final TelegramProvider telegramProvider;
    private final IpAuditLogService ipAuditLogService;

    public void process(String text, String chatId) {
        if (text == null) return;
        String trimmed = text.trim();
        if (!trimmed.startsWith("수락")) return;

        Matcher matcher = PATTERN.matcher(trimmed);
        if (!matcher.matches()) {
            log.info("IpApprovalProcessor: ignore (pattern mismatch) chatId={} text={}", chatId, trimmed);
            return;
        }

        String requestId = matcher.group(1);
        String amountStr = matcher.group(2);
        String unit = matcher.group(3);
        log.info("IpApprovalProcessor: parsed chatId={} requestId={} amount={} unit={}",
                chatId, requestId, amountStr, unit);

        String pendingKey = "monitor:pending:" + requestId;
        String ip = redisTemplate.opsForValue().get(pendingKey);
        if (ip == null || ip.isBlank()) {
            log.warn("IpApprovalProcessor: pending not found chatId={} requestId={} (expired or wrong id)",
                    chatId, requestId);
            telegramProvider.sendMessage("⚠️ 요청이 만료되었습니다. 차단 페이지에서 다시 요청해주세요.");
            return;
        }

        long ttlSeconds = ttlSeconds(amountStr, unit);
        log.info("IpApprovalProcessor: approving ip={} ttlSeconds={} requestId={}", ip, ttlSeconds, requestId);

        redisTemplate.opsForValue().set("monitor:allowed-ip:" + ip, "1", ttlSeconds, TimeUnit.SECONDS);
        redisTemplate.delete(pendingKey); // 1회용 소진
        redisTemplate.delete("monitor:ip-pending:" + ip); // 동일 IP 재요청 가능하게 해제

        ipAuditLogService.record(IpAuditLog.EventType.APPROVE, ip, requestId);
    }

    private static long ttlSeconds(String amountStr, String unit) {
        if (amountStr == null || unit == null) {
            return 3600;
        }
        try {
            long amount = Long.parseLong(amountStr);
            if (amount <= 0) return 3600;
            if ("분".equals(unit)) return amount * 60;
            if ("시간".equals(unit)) return amount * 3600;
            return 3600;
        } catch (Exception e) {
            return 3600;
        }
    }
}

