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
        /* registry는 "인터셉터 목록을 관리하는 객체"예요. .addInterceptor()로 인터셉터를 등록하고, .addPathPatterns()로
           어느 경로에 적용할지 지정해요.*/
        /*registry.addInterceptor(adminIpInterceptor)
                .addPathPatterns("/api/admin/**")
                .excludePathPatterns("/api/monitor/access-request");*/
    }
}

