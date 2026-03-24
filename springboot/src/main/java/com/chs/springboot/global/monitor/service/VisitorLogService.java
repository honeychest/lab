// [AGENT] 방문자 접속 기록 서비스 (VisitorLogInterceptor 호출용)
package com.chs.springboot.global.monitor.service;

import com.chs.springboot.global.monitor.entity.VisitorLog;
import com.chs.springboot.global.monitor.repository.VisitorLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class VisitorLogService {

    private final VisitorLogRepository repository;

    @Async
    @Transactional
    public void record(String ip, String path) {
        VisitorLog log = new VisitorLog();
        log.setIp(ip);
        log.setPath(path);
        repository.save(log);
    }
}
