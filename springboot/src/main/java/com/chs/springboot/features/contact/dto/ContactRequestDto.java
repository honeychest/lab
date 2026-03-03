package com.chs.springboot.features.contact.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;

@Getter
public class ContactRequestDto {

    @NotBlank(message = "메시지를 입력해 주세요.")
    @Size(max = 300, message = "메시지는 300자 이내로 입력해 주세요.")
    private String message;
}
