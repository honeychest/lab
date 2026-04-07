// [AGENT] 인증 결과 DTO — 로그인 성공 후 account와 permissionCodes를 함께 전달
package com.chs.springboot.global.auth.dto;

import com.chs.springboot.global.auth.entity.UserAccount;
import lombok.Getter;

import java.util.List;

@Getter
public class AuthenticatedUser {
    private final UserAccount account;
    private final List<String> permissionCodes;

    public AuthenticatedUser(UserAccount account, List<String> permissionCodes) {
        this.account = account;
        this.permissionCodes = permissionCodes;
    }
}
