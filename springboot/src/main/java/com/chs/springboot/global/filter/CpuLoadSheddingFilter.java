package com.chs.springboot.global.filter;

import com.chs.springboot.global.monitor.service.MetricCollectorService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Slf4j
@Component
@RequiredArgsConstructor
public class CpuLoadSheddingFilter extends OncePerRequestFilter {

    private static final double CPU_THRESHOLD = 95.0;

    private final MetricCollectorService metricCollectorService;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        double cpu = metricCollectorService.getLastCpu();
        if (cpu >= CPU_THRESHOLD) {
            log.warn("[LoadShedding] CPU={}% >= {}% → 503 반환 uri={}", String.format("%.1f", cpu), CPU_THRESHOLD, request.getRequestURI());
            response.setStatus(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"error\":\"Server overloaded\"}");
            return;
        }
        filterChain.doFilter(request, response);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.startsWith("/actuator") || path.startsWith("/ws");
    }
}
