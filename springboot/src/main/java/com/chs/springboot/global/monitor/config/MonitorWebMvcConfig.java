// [AGENT] AdminIpInterceptor 등록
package com.chs.springboot.global.monitor.config;

import com.chs.springboot.global.monitor.interceptor.AdminIpInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class MonitorWebMvcConfig implements WebMvcConfigurer {

    private final AdminIpInterceptor adminIpInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(adminIpInterceptor)
                .addPathPatterns("/api/admin/**")
                .excludePathPatterns("/api/monitor/access-request");
    }
}

