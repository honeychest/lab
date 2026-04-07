// [AGENT] 계정-권한 리포지토리 — 특정 계정의 권한 연결 목록 조회 담당
package com.chs.springboot.global.auth.repository;

import com.chs.springboot.global.auth.entity.UserAccount;
import com.chs.springboot.global.auth.entity.UserAccountPermission;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface UserAccountPermissionRepository extends JpaRepository<UserAccountPermission, Long> {
    // 이 UserAccount 를 가진 user_account_permission 행 전부 조회
    List<UserAccountPermission> findByUserAccount(UserAccount userAccount);
}
