// [AGENT] VisitorLog JPA repository — 최근 이력 + 경로별 집계
package com.chs.springboot.global.monitor.repository;

import com.chs.springboot.global.monitor.entity.VisitorLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface VisitorLogRepository extends JpaRepository<VisitorLog, Long> {

    List<VisitorLog> findTop100ByIpNotOrderByVisitedAtDesc(String ip);

    @Query("SELECT v.path AS path, COUNT(v) AS cnt FROM VisitorLog v WHERE v.ip != :excludeIp GROUP BY v.path ORDER BY COUNT(v) DESC")
    List<PathCountProjection> countByPathExcluding(String excludeIp);

    interface PathCountProjection {
        String getPath();
        Long getCnt();
    }
}
