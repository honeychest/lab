// [AGENT] 앱 설정 레포지토리
package com.chs.springboot.global.config.repository;

import com.chs.springboot.global.config.entity.AppConfig;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AppConfigRepository extends JpaRepository<AppConfig, Long> {
    Optional<AppConfig> findByConfigKey(String configKey);
}