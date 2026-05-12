package com.chs.springboot.domain.binance.service.rawwriter;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.kafka.support.SendResult;

import java.util.List;
import java.util.concurrent.CompletableFuture;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AggTradeRawWriterConsumerTest {

    private final AggTradeRawWriterService writerService = mock(AggTradeRawWriterService.class);
    @SuppressWarnings("unchecked")
    private final KafkaTemplate<String, String> kafkaTemplate = mock(KafkaTemplate.class);
    private final AggTradeRawWriterConsumer consumer = new AggTradeRawWriterConsumer(writerService, kafkaTemplate, true);
    private final Acknowledgment ack = mock(Acknowledgment.class);

    @Test
    void acknowledgesOffsetAfterWriterSuccess() {
        consumer.consume(List.of(record("BTCUSDT|FUTURES", "{}")), ack);

        verify(writerService).writeBatch(org.mockito.ArgumentMatchers.anyList());
        verify(ack).acknowledge();
        verify(kafkaTemplate, never()).send(anyString(), anyString(), anyString());
    }

    @Test
    void leavesOffsetUncommittedWhenDbFails() {
        org.mockito.Mockito.doThrow(new DataAccessResourceFailureException("db down"))
                .when(writerService).writeBatch(org.mockito.ArgumentMatchers.anyList());

        consumer.consume(List.of(record("BTCUSDT|FUTURES", "{}")), ack);

        verify(ack, never()).acknowledge();
        verify(kafkaTemplate, never()).send(anyString(), anyString(), anyString());
    }

    @Test
    void sendsInvalidMessageToDlqThenAcknowledges() {
        org.mockito.Mockito.doThrow(new InvalidAggTradeRawMessageException("Missing payload.a"))
                .when(writerService).writeBatch(org.mockito.ArgumentMatchers.anyList());
        CompletableFuture<SendResult<String, String>> dlqSent = CompletableFuture.completedFuture(null);
        when(kafkaTemplate.send(eq("market.aggtrade.dlq"), eq("BTCUSDT|FUTURES"), anyString()))
                .thenReturn(dlqSent);

        consumer.consume(List.of(record("BTCUSDT|FUTURES", "{bad-json")), ack);

        verify(kafkaTemplate).send(eq("market.aggtrade.dlq"), eq("BTCUSDT|FUTURES"), org.mockito.ArgumentMatchers.contains("Missing payload.a"));
        verify(ack).acknowledge();
    }

    @Test
    void leavesOffsetUncommittedWhenDlqPublishFails() {
        org.mockito.Mockito.doThrow(new InvalidAggTradeRawMessageException("Missing payload.a"))
                .when(writerService).writeBatch(org.mockito.ArgumentMatchers.anyList());
        CompletableFuture<SendResult<String, String>> dlqFailed = new CompletableFuture<>();
        dlqFailed.completeExceptionally(new RuntimeException("kafka down"));
        when(kafkaTemplate.send(eq("market.aggtrade.dlq"), eq("BTCUSDT|FUTURES"), anyString()))
                .thenReturn(dlqFailed);

        consumer.consume(List.of(record("BTCUSDT|FUTURES", "{bad-json")), ack);

        verify(ack, never()).acknowledge();
    }

    private ConsumerRecord<String, String> record(String key, String value) {
        return new ConsumerRecord<>("market.aggtrade.raw", 1, 7L, key, value);
    }
}

