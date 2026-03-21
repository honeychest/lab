// [AGENT] 뉴스 API 컨트롤러 — GET /api/news                                                                                          
package com.chs.springboot.global.news.controller;

import com.chs.springboot.global.news.dto.NewsItem;
import com.chs.springboot.global.news.service.NewsService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/news")
@RequiredArgsConstructor
public class NewsController {

    private final NewsService newsService;

    // 캐시된 뉴스 목록 반환
    // 매 요청마다 RSS를 호출하지 않고 NewsService가 5분마다 갱신한 캐시를 그대로 줌
    @GetMapping
    public List<NewsItem> getNews() {
        return newsService.getNews();
    }
}