// [AGENT] IpAuditLog JPA repository
package com.chs.springboot.global.monitor.repository;

import com.chs.springboot.global.monitor.entity.IpAuditLog;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IpAuditLogRepository extends JpaRepository<IpAuditLog, Long> {
}

