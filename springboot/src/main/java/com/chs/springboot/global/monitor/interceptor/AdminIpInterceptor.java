// [AGENT] /api/admin/** 접근 IP 제어 인터셉터 (Redis monitor:allowed-ip:{ip} 기반, fail-safe=차단)
package com.chs.springboot.global.monitor.interceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Slf4j
@Component
@RequiredArgsConstructor
public class AdminIpInterceptor implements HandlerInterceptor {

    private final StringRedisTemplate redisTemplate;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        try {
            String clientIp = extractClientIp(request);
            String key = "monitor:allowed-ip:" + clientIp;
            Boolean exists = redisTemplate.hasKey(key);

            if (Boolean.TRUE.equals(exists)) {
                return true;
            }

            response.sendError(403);
            return false;
        } catch (Exception e) {
            // fail-safe = 차단 (Redis 장애 등)
            log.warn("AdminIpInterceptor error, blocking request: {}", e.getMessage());
            try {
                response.sendError(403);
            } catch (Exception ignored) {
            }
            return false;
        }
    }

    private static String extractClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        String ip = (xff != null && !xff.isBlank()) ? xff.split(",")[0].trim() : request.getRemoteAddr();
        if ("0:0:0:0:0:0:0:1".equals(ip) || "::1".equals(ip)) {
            return "127.0.0.1";
        }
        return ip;
    }
}

