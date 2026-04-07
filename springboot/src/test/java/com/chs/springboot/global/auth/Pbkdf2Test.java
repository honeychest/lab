package com.chs.springboot.global.auth;


import com.chs.springboot.domain.upbit.service.UpbitStreamService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.Pbkdf2PasswordEncoder;

import static org.springframework.security.crypto.password.Pbkdf2PasswordEncoder.SecretKeyFactoryAlgorithm.PBKDF2WithHmacSHA256;

public class Pbkdf2Test {
    private static final Logger log = LoggerFactory.getLogger(Pbkdf2Test.class);
    public static void main(String[] args) {
        Pbkdf2PasswordEncoder encoder = new Pbkdf2PasswordEncoder("", 16, 610000, PBKDF2WithHmacSHA256);
        log.info(encoder.encode("123456"));
    }
}
