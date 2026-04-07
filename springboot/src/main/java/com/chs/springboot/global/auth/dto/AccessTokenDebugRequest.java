// [AGENT] access token 디버그 요청 DTO — 테스트 페이지에서 검증할 accessToken을 전달
package com.chs.springboot.global.auth.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class AccessTokenDebugRequest {
    private String accessToken;

    public AccessTokenDebugRequest() {
    }

    public AccessTokenDebugRequest(String accessToken) {
        this.accessToken = accessToken;
    }
}
