// [AGENT] 로그인 요청 DTO — email/password 요청 본문을 Jackson 바인딩으로 받음
package com.chs.springboot.global.auth.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter // jackson 이 JSON을 객체로 변환해줄 수 있도록 추가.
public class LoginRequest {
    private String email;
    private String password;
    public LoginRequest(String email, String password) {
        this.email = email;
        this.password = password;
    }
    public LoginRequest() {
        /* 빈 LoginRequest 객체 하나 생성 그 다음에 Jackson 이 setter를 써서 JSON으로 넘어온 브라우저의 Request에서
         * email 넣고 password 넣어서 채움. 이걸 로그인할때 이용.
         * */
    }
}
