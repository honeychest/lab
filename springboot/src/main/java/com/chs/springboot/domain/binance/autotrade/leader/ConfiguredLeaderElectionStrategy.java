package com.chs.springboot.domain.binance.autotrade.leader;

import java.util.Objects;

/**
 * 현재는 실행 리더 이름을 환경 설정으로 고정한다.
 * 리더 선출을 Redis 기반으로 바꿔도 호출부는 LeaderElectionStrategy만 사용한다.
 */
public final class ConfiguredLeaderElectionStrategy implements LeaderElectionStrategy {

    private final String currentServerName;
    private final String configuredLeaderName;

    public ConfiguredLeaderElectionStrategy(String currentServerName, String configuredLeaderName) {
        this.currentServerName = requireName(currentServerName, "현재 서버 이름");
        this.configuredLeaderName = requireName(configuredLeaderName, "자동매매 실행 리더 이름");
    }

    @Override
    public String currentLeader() {
        return configuredLeaderName;
    }

    @Override
    public boolean isExecutionOwner() {
        return configuredLeaderName.equals(currentServerName);
    }

    private String requireName(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + "은 비어 있을 수 없습니다");
        }
        return Objects.requireNonNull(value).trim();
    }
}
