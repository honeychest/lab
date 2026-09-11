package com.chs.springboot.domain.binance.autotrade.leader;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AutoTradeExecutionRouter {

    private final LeaderElectionStrategy leaderElectionStrategy;

    public AutoTradeExecutionRoute route() {
        if (leaderElectionStrategy.isExecutionOwner()) {
            return new AutoTradeExecutionRoute(AutoTradeExecutionRouteKind.EXECUTE_HERE,
                    leaderElectionStrategy.currentLeader(), "현재 서버가 자동매매 실행 리더입니다");
        }
        String leader = leaderElectionStrategy.currentLeader();
        if (leader == null || leader.isBlank()) {
            return new AutoTradeExecutionRoute(AutoTradeExecutionRouteKind.UNAVAILABLE,
                    "", "자동매매 실행 리더가 정해지지 않았습니다");
        }
        return new AutoTradeExecutionRoute(AutoTradeExecutionRouteKind.FORWARD_TO_LEADER,
                leader, "자동매매 실행 리더로 전달해야 합니다");
    }
}
