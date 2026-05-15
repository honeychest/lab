package com.chs.springboot.domain.binance.service.rawwriter;

import com.chs.springboot.global.redis.LeadershipChangedEvent;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DataAccessException;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.MessageListenerContainer;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@ConditionalOnProperty(name = "binance.agg-trade.raw-writer.enabled", havingValue = "true")
public class AggTradeRawWriterConsumer {

    private static final Logger log = LoggerFactory.getLogger(AggTradeRawWriterConsumer.class);

    private static final String RAW_TOPIC = "market.aggtrade.raw";
    private static final String DLQ_TOPIC = "market.aggtrade.dlq";
    static final String LISTENER_ID = "rawWriterListener";

    private final AggTradeRawWriterService writerService;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final KafkaListenerEndpointRegistry listenerRegistry;
    private final AggTradeRawWriterDryRunVerifier verifier;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final boolean enabled;

    public AggTradeRawWriterConsumer(AggTradeRawWriterService writerService,
                                     KafkaTemplate<String, String> kafkaTemplate,
                                     KafkaListenerEndpointRegistry listenerRegistry,
                                     AggTradeRawWriterDryRunVerifier verifier,
                                     @Value("${binance.agg-trade.raw-writer.enabled:false}") boolean enabled) {
        this.writerService = writerService;
        this.kafkaTemplate = kafkaTemplate;
        this.listenerRegistry = listenerRegistry;
        this.verifier = verifier;
        this.enabled = enabled;
    }

    @EventListener
    public void onLeadershipChanged(LeadershipChangedEvent event) {
        MessageListenerContainer container = listenerRegistry.getListenerContainer(LISTENER_ID);
        if (container == null) {
            return;
        }
        if (event.leader()) {
            if (!container.isRunning()) {
                container.start();
                log.info("[AggTradeRawWriter] 리더 획득: consumer 시작");
            }
        } else {
            if (container.isRunning()) {
                container.stop();
                verifier.discardInFlightVerification();
                log.info("[AggTradeRawWriter] 리더 상실: consumer 정지");
            }
        }
    }

    @KafkaListener(
            id = LISTENER_ID,
            topics = RAW_TOPIC,
            groupId = "raw-writer",
            containerFactory = "aggTradeRawWriterKafkaListenerContainerFactory",
            autoStartup = "false"
    )
    public void consume(List<ConsumerRecord<String, String>> records, Acknowledgment ack) {
        if (!enabled || records == null || records.isEmpty()) {
            return;
        }
        try {
            writerService.writeBatch(toMessages(records));
            ack.acknowledge();
        } catch (InvalidAggTradeRawMessageException e) {
            if (retrySeparatelyAndDlqInvalid(records)) {
                ack.acknowledge();
            }
        } catch (DataAccessException e) {
            log.error("[AggTradeRawWriter] DB 실패, offset commit 보류: {}", e.getMessage());
        } catch (Exception e) {
            log.error("[AggTradeRawWriter] 처리 실패, offset commit 보류", e);
        }
    }

    private List<AggTradeRawWriterMessage> toMessages(List<ConsumerRecord<String, String>> records) {
        return records.stream()
                .map(record -> new AggTradeRawWriterMessage(
                        record.topic(),
                        record.partition(),
                        record.offset(),
                        record.key(),
                        record.value()
                ))
                .toList();
    }

    private boolean retrySeparatelyAndDlqInvalid(List<ConsumerRecord<String, String>> records) {
        for (ConsumerRecord<String, String> record : records) {
            try {
                writerService.writeBatch(List.of(new AggTradeRawWriterMessage(
                        record.topic(),
                        record.partition(),
                        record.offset(),
                        record.key(),
                        record.value()
                )));
            } catch (InvalidAggTradeRawMessageException invalid) {
                if (!publishDlq(record, invalid)) {
                    return false;
                }
            } catch (DataAccessException e) {
                log.error("[AggTradeRawWriter] invalid 분리 처리 중 DB 실패, offset commit 보류: {}", e.getMessage());
                return false;
            } catch (Exception e) {
                log.error("[AggTradeRawWriter] invalid 분리 처리 실패, offset commit 보류", e);
                return false;
            }
        }
        return true;
    }

    private boolean publishDlq(ConsumerRecord<String, String> record, InvalidAggTradeRawMessageException error) {
        try {
            String dlqValue = buildDlqEnvelope(record, error);
            kafkaTemplate.send(DLQ_TOPIC, record.key(), dlqValue).join();
            return true;
        } catch (Exception e) {
            log.error("[AggTradeRawWriter] DLQ publish 실패, offset commit 보류: {}", e.getMessage());
            return false;
        }
    }

    private String buildDlqEnvelope(ConsumerRecord<String, String> record, InvalidAggTradeRawMessageException error)
            throws JsonProcessingException {
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("originalTopic", record.topic());
        envelope.put("originalKey", record.key());
        envelope.put("originalValue", record.value());
        envelope.put("originalPartition", record.partition());
        envelope.put("originalOffset", record.offset());
        envelope.put("errorType", "INVALID_MESSAGE");
        envelope.put("errorMessage", error.getMessage());
        envelope.put("failedAt", System.currentTimeMillis());
        return objectMapper.writeValueAsString(envelope);
    }
}
