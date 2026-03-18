// [AGENT] IpAuditLog 기록 서비스 (REQUEST/APPROVE/EXPIRE)
package com.chs.springboot.global.monitor.service;

import com.chs.springboot.global.monitor.entity.IpAuditLog;
import com.chs.springboot.global.monitor.repository.IpAuditLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class IpAuditLogService {

    private final IpAuditLogRepository repository;

    @Transactional
    public void record(IpAuditLog.EventType eventType, String ip, String requestId) {
        IpAuditLog log = new IpAuditLog();
        log.setEventType(eventType);
        log.setIp(ip);
        log.setRequestId(requestId);
        repository.save(log);
    }
}

