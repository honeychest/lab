package com.chs.springboot.global.config.service;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.crypto.password.Pbkdf2PasswordEncoder;

@Configuration
public class PasswordEncoderConfig {
    @Bean
    public PasswordEncoder passwordEncodeer(){
        return new Pbkdf2PasswordEncoder(
                "", // 추가 secret(perpper) 없음
                16, // salt 길이
                610000, // 반복횟수 SWASP 권고 60만회 이상.
                Pbkdf2PasswordEncoder.SecretKeyFactoryAlgorithm.PBKDF2WithHmacSHA256 // 해시 알고리즘
        );
    }
}
