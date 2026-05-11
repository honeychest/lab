package com.chs.springboot.domain.binance.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;

import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AggTradeKafkaProducerTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    @SuppressWarnings("unchecked")
    private final KafkaTemplate<String, String> kafkaTemplate = mock(KafkaTemplate.class);
    private final AggTradeKafkaProducer producer = new AggTradeKafkaProducer(
            kafkaTemplate,
            objectMapper
    );

    @Test
    void publishesRawPayloadWithPartitionKeyAndMetadataEnvelope() throws Exception {
        String payload = """
                {
                  "e": "aggTrade",
                  "a": 123,
                  "p": "100.0",
                  "q": "0.01",
                  "f": 1,
                  "l": 1,
                  "T": 1778410000000,
                  "m": false
                }
                """;
        CompletableFuture<SendResult<String, String>> expected = CompletableFuture.completedFuture(null);
        when(kafkaTemplate.send(eq(AggTradeKafkaProducer.RAW_TOPIC), eq("BTCUSDT|FUTURES"), org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(expected);

        CompletableFuture<SendResult<String, String>> actual = producer.publishRaw(
                payload,
                "BTCUSDT",
                "FUTURES",
                1778410000123L
        );

        assertThat(actual).isSameAs(expected);
        org.mockito.ArgumentCaptor<String> valueCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(eq(AggTradeKafkaProducer.RAW_TOPIC), eq("BTCUSDT|FUTURES"), valueCaptor.capture());

        JsonNode value = objectMapper.readTree(valueCaptor.getValue());
        assertThat(value.get("symbol").asText()).isEqualTo("BTCUSDT");
        assertThat(value.get("marketType").asText()).isEqualTo("FUTURES");
        assertThat(value.get("payload").get("a").asLong()).isEqualTo(123L);
        assertThat(value.get("payload").get("p").asText()).isEqualTo("100.0");
        assertThat(value.get("receivedAt").asLong()).isEqualTo(1778410000123L);
    }

    @Test
    void rejectsInvalidPayloadJson() {
        assertThatThrownBy(() -> producer.publishRaw("{bad-json", "BTCUSDT", "FUTURES", 1778410000123L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Invalid aggTrade payload JSON");
    }
}
