// [AGENT] 사용자 계정 리포지토리 — email 기준 계정 조회와 기본 CRUD 담당
package com.chs.springboot.global.auth.repository;

import com.chs.springboot.global.auth.entity.UserAccount;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserAccountRepository extends JpaRepository<UserAccount, Long> {
    Optional<UserAccount> findByEmail(String email);
}
