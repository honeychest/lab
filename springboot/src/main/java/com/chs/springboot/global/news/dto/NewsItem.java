package com.chs.springboot.global.news.dto;// [AGENT] 뉴스 아이템 DTO — RSS에서 파싱한 뉴스 1건을 담는 불변 객체


import java.time.LocalDateTime;

// record: Java 16+에서 지원하는 불변 데이터 클래스
// getter, equals, hashCode, toString 자동 생성
// 뉴스 한 건의 데이터를 담기만 하면 되므로 record가 적합
public record NewsItem(

        // 뉴스 제목
        String title,

        // 기사 원문 URL (중복 제거 1차 키로 사용)
        String link,

        // 출처 표시용 (예: "네이버", "구글")
        String source,

        // 카테고리 (예: "경제", "IT", "인기")
        String category,

        // 기사 발행 시각 — RSS의 <pubDate> 파싱 결과
        // null일 수 있음 (일부 피드에 날짜 누락)
        LocalDateTime publishedAt

) {}