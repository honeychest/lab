-- MySQL dump 10.13  Distrib 8.0.45, for Linux (x86_64)
--
-- Host: localhost    Database: home-db
-- ------------------------------------------------------
-- Server version	8.0.45

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `agg_trade_1m`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agg_trade_1m` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `symbol` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '심볼 (예: BTCUSDT)',
  `market_type` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT 'SPOT / FUTURES',
  `buy_quantity` decimal(30,8) NOT NULL COMMENT '매수 수량 코인 (is_buyer_maker=0)',
  `buy_trade_count` bigint NOT NULL COMMENT '매수 체결 건수',
  `buy_volume` decimal(30,8) NOT NULL COMMENT '매수 거래대금 USD (is_buyer_maker=0)',
  `candle_time_ms` bigint NOT NULL COMMENT '봉 시작 Unix ms (UTC)',
  `close_price` decimal(20,8) NOT NULL COMMENT '종가',
  `high_price` decimal(20,8) NOT NULL COMMENT '고가',
  `low_price` decimal(20,8) NOT NULL COMMENT '저가',
  `max_agg_trade_id` bigint NOT NULL COMMENT 'MAX(agg_trade_id) — 구간 내 마지막 aggTrade',
  `max_last_trade_id` bigint NOT NULL COMMENT 'MAX(last_trade_id) — 구간 내 마지막 원시 체결',
  `min_agg_trade_id` bigint NOT NULL COMMENT 'MIN(agg_trade_id) — 구간 내 첫 aggTrade',
  `min_first_trade_id` bigint NOT NULL COMMENT 'MIN(first_trade_id) — 구간 내 첫 원시 체결',
  `open_price` decimal(20,8) NOT NULL COMMENT '시가',
  `sell_quantity` decimal(30,8) NOT NULL COMMENT '매도 수량 코인 (is_buyer_maker=1)',
  `sell_trade_count` bigint NOT NULL COMMENT '매도 체결 건수',
  `sell_volume` decimal(30,8) NOT NULL COMMENT '매도 거래대금 USD (is_buyer_maker=1)',
  `total_volume` decimal(30,8) NOT NULL COMMENT '전체 거래대금 USD',
  `trade_count` bigint NOT NULL COMMENT '전체 체결 건수',
  `vwap` decimal(20,8) NOT NULL COMMENT 'VWAP (거래량 가중 평균가)',
  `delta` decimal(30,8) NOT NULL DEFAULT '0.00000000' COMMENT '매수수량 - 매도수량 (delta)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_agg_trade_1m` (`symbol`,`market_type`,`candle_time_ms`),
  KEY `idx_1m_symbol_candle_time` (`symbol`,`candle_time_ms`),
  KEY `idx_1m_candle_time` (`candle_time_ms`)
) ENGINE=InnoDB AUTO_INCREMENT=800851 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `agg_trade_1s`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agg_trade_1s` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `symbol` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '심볼 (예: BTCUSDT)',
  `market_type` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT 'SPOT / FUTURES',
  `buy_quantity` decimal(30,8) NOT NULL COMMENT '매수 수량 코인 (is_buyer_maker=0)',
  `buy_trade_count` bigint NOT NULL COMMENT '매수 체결 건수',
  `buy_volume` decimal(30,8) NOT NULL COMMENT '매수 거래대금 USD (is_buyer_maker=0)',
  `candle_time_ms` bigint NOT NULL COMMENT '봉 시작 Unix ms (UTC)',
  `close_price` decimal(20,8) NOT NULL COMMENT '종가',
  `high_price` decimal(20,8) NOT NULL COMMENT '고가',
  `low_price` decimal(20,8) NOT NULL COMMENT '저가',
  `max_agg_trade_id` bigint NOT NULL COMMENT 'MAX(agg_trade_id) — 구간 내 마지막 aggTrade',
  `max_last_trade_id` bigint NOT NULL COMMENT 'MAX(last_trade_id) — 구간 내 마지막 원시 체결',
  `min_agg_trade_id` bigint NOT NULL COMMENT 'MIN(agg_trade_id) — 구간 내 첫 aggTrade',
  `min_first_trade_id` bigint NOT NULL COMMENT 'MIN(first_trade_id) — 구간 내 첫 원시 체결',
  `open_price` decimal(20,8) NOT NULL COMMENT '시가',
  `sell_quantity` decimal(30,8) NOT NULL COMMENT '매도 수량 코인 (is_buyer_maker=1)',
  `sell_trade_count` bigint NOT NULL COMMENT '매도 체결 건수',
  `sell_volume` decimal(30,8) NOT NULL COMMENT '매도 거래대금 USD (is_buyer_maker=1)',
  `total_volume` decimal(30,8) NOT NULL COMMENT '전체 거래대금 USD',
  `trade_count` bigint NOT NULL COMMENT '전체 체결 건수',
  `vwap` decimal(20,8) NOT NULL COMMENT 'VWAP (거래량 가중 평균가)',
  `delta` decimal(30,8) NOT NULL COMMENT '매수수량 - 매도수량 (delta)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_agg_trade_1s` (`symbol`,`market_type`,`candle_time_ms`),
  KEY `idx_1s_symbol_candle_time` (`symbol`,`candle_time_ms`),
  KEY `idx_1s_candle_time` (`candle_time_ms`)
) ENGINE=InnoDB AUTO_INCREMENT=9813607 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `agg_trade_5m`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agg_trade_5m` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `symbol` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '심볼 (예: BTCUSDT)',
  `market_type` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT 'SPOT / FUTURES',
  `buy_quantity` decimal(30,8) NOT NULL COMMENT '매수 수량 코인 (is_buyer_maker=0)',
  `buy_trade_count` bigint NOT NULL COMMENT '매수 체결 건수',
  `buy_volume` decimal(30,8) NOT NULL COMMENT '매수 거래대금 USD (is_buyer_maker=0)',
  `candle_time_ms` bigint NOT NULL COMMENT '봉 시작 Unix ms (UTC)',
  `close_price` decimal(20,8) NOT NULL COMMENT '종가',
  `high_price` decimal(20,8) NOT NULL COMMENT '고가',
  `low_price` decimal(20,8) NOT NULL COMMENT '저가',
  `max_agg_trade_id` bigint NOT NULL COMMENT 'MAX(agg_trade_id) — 구간 내 마지막 aggTrade',
  `max_last_trade_id` bigint NOT NULL COMMENT 'MAX(last_trade_id) — 구간 내 마지막 원시 체결',
  `min_agg_trade_id` bigint NOT NULL COMMENT 'MIN(agg_trade_id) — 구간 내 첫 aggTrade',
  `min_first_trade_id` bigint NOT NULL COMMENT 'MIN(first_trade_id) — 구간 내 첫 원시 체결',
  `open_price` decimal(20,8) NOT NULL COMMENT '시가',
  `sell_quantity` decimal(30,8) NOT NULL COMMENT '매도 수량 코인 (is_buyer_maker=1)',
  `sell_trade_count` bigint NOT NULL COMMENT '매도 체결 건수',
  `sell_volume` decimal(30,8) NOT NULL COMMENT '매도 거래대금 USD (is_buyer_maker=1)',
  `total_volume` decimal(30,8) NOT NULL COMMENT '전체 거래대금 USD',
  `trade_count` bigint NOT NULL COMMENT '전체 체결 건수',
  `vwap` decimal(20,8) NOT NULL COMMENT 'VWAP (거래량 가중 평균가)',
  `delta` decimal(30,8) NOT NULL DEFAULT '0.00000000' COMMENT '매수수량 - 매도수량 (delta)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_agg_trade_5m` (`symbol`,`market_type`,`candle_time_ms`),
  KEY `idx_5m_symbol_candle_time` (`symbol`,`candle_time_ms`)
) ENGINE=InnoDB AUTO_INCREMENT=40672 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `aggtrade_collect_status`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `aggtrade_collect_status` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `symbol` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '심볼 (예: BTCUSDT)',
  `market_type` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'SPOT / FUTURES',
  `last_stream_agg_id` bigint DEFAULT NULL COMMENT '실시간 스트림으로 DB까지 적재된 마지막 agg_trade_id',
  `last_backfill_agg_id` bigint DEFAULT NULL COMMENT '백필(과거→현재)로 DB까지 적재된 마지막 agg_trade_id',
  `backfill_interval_min` int DEFAULT NULL COMMENT '백필 수행 주기 (분 단위)',
  `next_backfill_at` datetime(6) DEFAULT NULL COMMENT '다음 백필 예정 시각',
  `last_backfill_checked_at` datetime(6) DEFAULT NULL COMMENT '해당 심볼/마켓에 대해 백필을 마지막으로 수행한 시각',
  `last_gap_detected_at` datetime(6) DEFAULT NULL COMMENT '누락(갭)을 마지막으로 감지한 시각',
  `enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '수집/백필 활성 여부',
  `notes` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '운영 메모',
  `created_at` datetime(6) NOT NULL COMMENT '레코드 생성 시각',
  `updated_at` datetime(6) NOT NULL COMMENT '레코드 수정 시각',
  `last_backfill_notified_at` datetime(6) DEFAULT NULL COMMENT '백필 누락 채움 알림을 마지막으로 전송한 시각',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_aggtrade_collect_status_symbol_market` (`symbol`,`market_type`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `alert_history`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `alert_history` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `ack_at` datetime(6) DEFAULT NULL,
  `duration_sec` int NOT NULL,
  `memo` tinytext,
  `metric_type` enum('API_ERROR','CPU','DISK','RAM','REDIS_QUEUE') NOT NULL,
  `resolve_at` datetime(6) DEFAULT NULL,
  `sent_at` datetime(6) NOT NULL,
  `severity` enum('CRITICAL','WARN') NOT NULL,
  `threshold` double NOT NULL,
  `value` double NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_alert_sent_at` (`sent_at`),
  KEY `idx_alert_metric_type` (`metric_type`,`sent_at`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `analysis_template`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `analysis_template` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `conditions` text NOT NULL COMMENT '조건 트리 JSON',
  `created_at` datetime DEFAULT NULL COMMENT '생성일시',
  `name` varchar(100) NOT NULL COMMENT '템플릿 이름',
  `palette` varchar(20) DEFAULT NULL COMMENT '팔레트 레벨 (LOW/MID/HIGH)',
  `updated_at` datetime DEFAULT NULL COMMENT '수정일시',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `app_config`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `app_config` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `config_key` varchar(100) NOT NULL,
  `config_value` varchar(500) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL COMMENT '수정 시각',
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKh8yysw1q2xkxwt3wr53t12sar` (`config_key`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `binance_trade`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `binance_trade` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `created_at` datetime(6) DEFAULT NULL COMMENT '레코드 생성 시각 (KST)',
  `is_buyer_maker` bit(1) NOT NULL COMMENT '1 숏침(롱익절) 0 롱침(숏익절)',
  `market_type` varchar(10) NOT NULL COMMENT '시장 구분 (SPOT / FUTURES)',
  `price` decimal(20,8) NOT NULL COMMENT '체결 단가 (USD)',
  `quantity` decimal(20,8) NOT NULL COMMENT '체결 수량 (BTC)',
  `symbol` varchar(20) NOT NULL COMMENT '거래쌍 (예: BTCUSDT)',
  `trade_id` bigint NOT NULL COMMENT '바이낸스 체결 ID',
  `trade_value` decimal(30,8) NOT NULL COMMENT '체결 금액 = price × quantity (USD)',
  `traded_at` bigint NOT NULL COMMENT '체결 시각 (UTC milliseconds)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_trade_id_market_type` (`trade_id`,`market_type`),
  KEY `idx_traded_at` (`traded_at`)
) ENGINE=InnoDB AUTO_INCREMENT=238369 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `contact_inquiry`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contact_inquiry` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `inquiry_id` varchar(36) NOT NULL,
  `message` text NOT NULL,
  `replied_at` datetime(6) DEFAULT NULL,
  `reply_text` text,
  `client_ip` varchar(45) DEFAULT NULL,
  `guest_token` varchar(36) DEFAULT NULL,
  `platform` varchar(20) DEFAULT NULL,
  `read_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKj00um580des16yh0030v3q44j` (`inquiry_id`)
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `force_order`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `force_order` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `symbol` varchar(20) NOT NULL COMMENT '심볼 — o.s',
  `side` varchar(10) NOT NULL COMMENT '청산 방향 BUY/SELL — o.S',
  `order_type` varchar(10) NOT NULL COMMENT '주문 유형 LIMIT — o.o',
  `time_in_force` varchar(10) NOT NULL COMMENT '유효 기간 IOC — o.f',
  `original_quantity` decimal(20,8) NOT NULL COMMENT '원래 주문 수량 — o.q',
  `price` decimal(20,8) NOT NULL COMMENT '주문 가격 — o.p',
  `avg_price` decimal(20,8) NOT NULL COMMENT '평균 체결가 — o.ap',
  `order_status` varchar(20) NOT NULL COMMENT '주문 상태 FILLED — o.X',
  `last_filled_qty` decimal(20,8) NOT NULL COMMENT '마지막 체결 수량 — o.l',
  `filled_accumulated_qty` decimal(20,8) NOT NULL COMMENT '누적 체결 수량 — o.z',
  `trade_time_ms` bigint NOT NULL COMMENT '체결 시각 Unix ms — o.T',
  `event_time_ms` bigint NOT NULL COMMENT '이벤트 발생 시각 Unix ms — E',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_force_order` (`symbol`,`trade_time_ms`,`side`,`original_quantity`),
  KEY `idx_fo_symbol_time` (`symbol`,`trade_time_ms`)
) ENGINE=InnoDB AUTO_INCREMENT=24413 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Binance 청산 강제주문 원본 (WebSocket !forceOrder@arr)';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ip_audit_log`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ip_audit_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `event_type` enum('APPROVE','EXPIRE','REQUEST') NOT NULL,
  `ip` varchar(45) NOT NULL,
  `occurred_at` datetime(6) NOT NULL,
  `request_id` varchar(8) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ip_audit_occurred_at` (`occurred_at`),
  KEY `idx_ip_audit_ip` (`ip`,`occurred_at`)
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `open_interest`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `open_interest` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `symbol` varchar(20) NOT NULL COMMENT '심볼 (예: BTCUSDT) — symbol',
  `open_interest` decimal(30,8) NOT NULL COMMENT '미결제약정 수량 (코인) — openInterest',
  `oi_value` decimal(30,8) DEFAULT NULL COMMENT 'USD 환산값 (sumOpenInterestValue) — 백필 시 채움, live polling은 null',
  `collected_at_ms` bigint NOT NULL COMMENT '수집 시각 Unix ms — time',
  `price` decimal(30,8) DEFAULT NULL COMMENT '수집 시각의 현재가 (USD) — price',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_open_interest` (`symbol`,`collected_at_ms`),
  KEY `idx_oi_symbol_time` (`symbol`,`collected_at_ms`)
) ENGINE=InnoDB AUTO_INCREMENT=1236107 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Binance Open Interest 원본 (1분 폴링)';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `raw_agg_trade`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `raw_agg_trade` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `symbol` varchar(20) NOT NULL,
  `market_type` varchar(10) NOT NULL,
  `agg_trade_id` bigint NOT NULL,
  `price` decimal(20,8) NOT NULL,
  `quantity` decimal(20,8) NOT NULL,
  `first_trade_id` bigint NOT NULL,
  `last_trade_id` bigint NOT NULL,
  `is_buyer_maker` bit(1) NOT NULL,
  `traded_at` bigint NOT NULL,
  `saved_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_raw_agg_trade` (`agg_trade_id`,`symbol`,`market_type`),
  KEY `idx_raw_agg_trade_symbol_market_traded` (`symbol`,`market_type`,`traded_at`),
  KEY `idx_raw_traded_at` (`traded_at`)
) ENGINE=InnoDB AUTO_INCREMENT=53371498 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `raw_tick`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `raw_tick` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `is_buyer_maker` bit(1) NOT NULL COMMENT '매수자=메이커 여부',
  `market_type` varchar(10) NOT NULL COMMENT 'SPOT / FUTURES',
  `price` decimal(20,8) NOT NULL COMMENT '체결가',
  `quantity` decimal(20,8) NOT NULL COMMENT '체결량',
  `saved_at` datetime(6) DEFAULT NULL COMMENT 'DB 저장 시각',
  `trade_id` bigint NOT NULL COMMENT '바이낸스 체결 ID',
  `traded_at` bigint NOT NULL COMMENT '체결 Unix ms',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rawtick` (`trade_id`,`market_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `signal_params`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `signal_params` (
  `symbol` varchar(20) NOT NULL COMMENT '심볼 PK (예: BTCUSDT)',
  `strip_count` int NOT NULL COMMENT 'PatternStrip 표시 개수 (기본 7)',
  `trigger_multiplier` double NOT NULL COMMENT '트리거 배수 (기본 10.0)',
  `updated_at` datetime(6) NOT NULL COMMENT '마지막 수정 시각',
  `vol_window` int NOT NULL COMMENT '평균 변동성 계산 윈도우 (봉 수, 기본 200)',
  PRIMARY KEY (`symbol`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `visitor_log`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `visitor_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `ip` varchar(45) NOT NULL COMMENT '방문자 IP',
  `path` varchar(255) NOT NULL COMMENT '접속 경로',
  `visited_at` datetime(6) NOT NULL COMMENT '접속 일시',
  PRIMARY KEY (`id`),
  KEY `idx_visitor_log_visited_at` (`visited_at`),
  KEY `idx_visitor_log_ip` (`ip`,`visited_at`)
) ENGINE=InnoDB AUTO_INCREMENT=581 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `weather_history`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `weather_history` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `fcst_date_time` datetime(6) NOT NULL,
  `hum` varchar(255) DEFAULT NULL,
  `nx` varchar(255) DEFAULT NULL,
  `ny` varchar(255) DEFAULT NULL,
  `rain` varchar(255) DEFAULT NULL,
  `reg_date_time` datetime(6) DEFAULT NULL,
  `region` varchar(255) NOT NULL,
  `tmp` varchar(255) DEFAULT NULL,
  `wind` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_region_fcstdatetime` (`region`,`fcst_date_time`),
  KEY `idx_region_fcst` (`region`,`fcst_date_time`)
) ENGINE=InnoDB AUTO_INCREMENT=7746 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-03-26  5:17:20
