package com.chs.springboot.global.auth.dto;

import lombok.Getter;
import lombok.Setter;

import java.util.List;
@Getter
public class AuthenticatedUserInfo {
    private final Long userId;
    private final List<String> permissionCodes;

    public AuthenticatedUserInfo(Long userId, List<String> permissionCodes) {
        this.userId = userId;
        this.permissionCodes = permissionCodes;
    }

}
