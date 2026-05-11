package com.chs.springboot.global.redis;

public record LeadershipChangedEvent(
        String serverName,
        boolean leader
) {
}
