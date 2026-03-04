package com.chs.springboot.features.contact.repository;

import com.chs.springboot.features.contact.entity.ContactInquiry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

// [AGENT] 문의 JPA 리포지토리
public interface ContactInquiryRepository extends JpaRepository<ContactInquiry, Long> {

    Optional<ContactInquiry> findByInquiryId(String inquiryId);

    List<ContactInquiry> findByGuestTokenOrderByCreatedAtDesc(String guestToken);
}
