package com.chs.springboot.domain.binance.autotrade.leader;

public interface LeaderElectionStrategy {

    String currentLeader();

    boolean isExecutionOwner();
}
