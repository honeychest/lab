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
    private static final long APPROVED_REQUEST_MARKER_TTL_SEC = 24 * 60 * 60;

    private final StringRedisTemplate redisTemplate;
    private final TelegramProvider telegramProvider;
    private final IpAuditLogService ipAuditLogService;

    public void process(String text, String chatId) {
        if (text == null) {
            return;
        }

        String trimmed = text.trim();
        if (!trimmed.startsWith("수락")) {
            return;
        }

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
            String approvedIp = redisTemplate.opsForValue().get("monitor:approved-request:" + requestId);
            if (approvedIp != null && !approvedIp.isBlank()) {
                log.info("IpApprovalProcessor: requestId={} already approved for ip={}", requestId, approvedIp);
                telegramProvider.sendMessage("ℹ️ 이미 승인된 요청입니다. IP: " + approvedIp);
                return;
            }

            log.warn("IpApprovalProcessor: pending not found chatId={} requestId={} (expired or wrong id)",
                    chatId, requestId);
            telegramProvider.sendMessage("⚠️ 요청이 만료되었습니다. 차단 페이지에서 다시 요청해주세요.");
            return;
        }

        long ttlSeconds = ttlSeconds(amountStr, unit);
        log.info("IpApprovalProcessor: approving ip={} ttlSeconds={} requestId={}", ip, ttlSeconds, requestId);

        redisTemplate.opsForValue().set("monitor:allowed-ip:" + ip, "1", ttlSeconds, TimeUnit.SECONDS);
        redisTemplate.opsForValue().set("monitor:approved-request:" + requestId, ip, APPROVED_REQUEST_MARKER_TTL_SEC, TimeUnit.SECONDS);
        redisTemplate.delete(pendingKey);
        redisTemplate.delete("monitor:ip-pending:" + ip);

        ipAuditLogService.record(IpAuditLog.EventType.APPROVE, ip, requestId);
        telegramProvider.sendMessage("✅ 승인 완료: " + ip + " / " + ttlSeconds + "초");
    }

    private static long ttlSeconds(String amountStr, String unit) {
        if (amountStr == null || unit == null) {
            return 3600;
        }

        try {
            long amount = Long.parseLong(amountStr);
            if (amount <= 0) {
                return 3600;
            }
            if ("분".equals(unit)) {
                return amount * 60;
            }
            if ("시간".equals(unit)) {
                return amount * 3600;
            }
            return 3600;
        } catch (Exception e) {
            return 3600;
        }
    }
}
