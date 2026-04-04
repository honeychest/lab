// [AGENT] 계정-권한 연결 엔티티 — user_account 와 user_permission의 다대다를 풀어낸 조인 테이블
package com.chs.springboot.global.auth.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "user_account_permission",
        uniqueConstraints = { //복합 유니크키 설정
                @UniqueConstraint(
                        name = "uq_user_account_permission",
                        columnNames = {"user_account_id", "user_permission_id"}
                )
        }
)
@Getter
@Setter
public class UserAccountPermission {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY) // 이게 AUTO_INCREMENT 해줌
    @Column
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY) // 필요할 때 실제 상대 엔티티를 읽어오게 하겠다
    @JoinColumn(name = "user_account_id", nullable = false) // 조합 Unique 키는 각 컬럼에 unique = true 쓰면 안됨. 그럼 그냥 컬럼별로 유니크키가 되는것.
    private UserAccount userAccount; // 이 필드는 JoinColumn으로 인해 더이상 숫자 FK가 아니라 엔티티 참조 필드가 됨.

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_permission_id", nullable = false) // JoinColumn 은 이 엔티티 필드가 어느 FK 컬럼에 연결되는지(포린키)표시
    private UserPermission userPermission;

    // @JoinColumn(name = "user_email", referencedColumnName = "email") 현재 테이블의 user_email 컬럼이 상대 엔티티의 email 컬럼을 참조한다 PK가 아닌 컬럼을 참조할 때는 referencedColumnName 사용

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
