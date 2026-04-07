-- [AGENT] 관리자 인증 스키마 추가 — user_account / user_permission / user_account_permission 생성 및 ADMIN_ACCESS seed 삽입
CREATE TABLE `user_account` (
                                 `id` bigint NOT NULL AUTO_INCREMENT COMMENT 'PK',
                                 `email` varchar(80) NOT NULL COMMENT '로그인 이메일',
                                 `password_hash` varchar(255) NOT NULL COMMENT 'PBKDF2 비밀번호 해시',
                                 `enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT '계정 활성 여부',
                                 `last_login_at` datetime DEFAULT NULL COMMENT '마지막 로그인 시각',
                                 `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 시각',
                                 `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정 시각',
                                 PRIMARY KEY (`id`),
                                 UNIQUE KEY `uq_user_account_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `user_permission` (
                                    `id` bigint NOT NULL AUTO_INCREMENT COMMENT 'PK',
                                    `code` varchar(20) NOT NULL COMMENT '권한 코드',
                                    `name` varchar(40) NOT NULL COMMENT '권한 이름',
                                    `description` varchar(255) NOT NULL COMMENT '권한 설명',
                                    `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 시각',
                                    PRIMARY KEY (`id`),
                                    UNIQUE KEY `uq_user_permission_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `user_account_permission` (
                                            `id` bigint NOT NULL AUTO_INCREMENT COMMENT 'PK',
                                            `user_account_id` bigint NOT NULL COMMENT '계정 ID',
                                            `user_permission_id` bigint NOT NULL COMMENT '권한 ID',
                                            `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 시각',
                                            PRIMARY KEY (`id`),
                                            UNIQUE KEY `uq_user_account_permission` (`user_account_id`, `user_permission_id`),
                                            KEY `idx_user_account_permission_permission_id` (`user_permission_id`),
                                            CONSTRAINT `fk_user_account_permission_account`
                                                FOREIGN KEY (`user_account_id`) REFERENCES `user_account` (`id`) ON DELETE CASCADE,
                                            CONSTRAINT `fk_user_account_permission_permission`
                                                FOREIGN KEY (`user_permission_id`) REFERENCES `user_permission` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO `user_permission` (`code`, `name`, `description`) VALUES
    ('ADMIN_ACCESS', '관리자 접근', '관리자 페이지 및 관리자 API 접근 권한');
