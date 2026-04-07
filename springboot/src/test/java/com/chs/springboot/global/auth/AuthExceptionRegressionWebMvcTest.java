package com.chs.springboot.global.auth;

import jakarta.servlet.ServletException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

/**
 * AuthExceptionHandler가 AuthController에만 한정될 때,
 * 다른 컨트롤러의 IllegalArgumentException이 auth JSON으로 삼켜지지 않음을 검증한다.
 */
class AuthExceptionRegressionWebMvcTest {

    @RestController
    @RequestMapping("/api/_regression")
    static class NonAuthControllerThrowingIae {

        @GetMapping("/iae")
        public void throwIae() {
            throw new IllegalArgumentException("잘못된 guestToken");
        }
    }

    @Test
    @DisplayName("타 도메인 IllegalArgumentException은 auth 에러 포맷으로 변환하지 않음")
    void nonAuthIllegalArgument_notAuthErrorBody() {
        MockMvc mockMvc = standaloneSetup(new NonAuthControllerThrowingIae())
                .setControllerAdvice(new AuthExceptionHandler())
                .build();

        assertThatThrownBy(() -> mockMvc.perform(get("/api/_regression/iae")
                        .accept(MediaType.APPLICATION_JSON)))
                .isInstanceOf(ServletException.class)
                .hasCauseInstanceOf(IllegalArgumentException.class);
    }
}
