import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import styled from 'styled-components';
import { sendTelegramInquiry } from '../../features/support/api/contactApi';

const MAX_LENGTH   = 300;
const TARGET_BYTES = 8 * 1024 * 1024;
const QUALITIES    = [0.9, 0.7, 0.5, 0.3];

const compressImage = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);

        const tryQuality = (idx) => {
            if (idx >= QUALITIES.length) {
                canvas.toBlob(
                    (blob) => blob ? resolve(blob) : reject(new Error('압축 실패')),
                    'image/jpeg', QUALITIES[QUALITIES.length - 1]
                );
                return;
            }
            canvas.toBlob((blob) => {
                if (!blob) { reject(new Error('압축 실패')); return; }
                blob.size <= TARGET_BYTES ? resolve(blob) : tryQuality(idx + 1);
            }, 'image/jpeg', QUALITIES[idx]);
        };
        tryQuality(0);
    };

    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('이미지 로드 실패')); };
    img.src = objectUrl;
});

const TelegramPopup = ({ isOpen, onClose }) => {
    const [text, setText]       = useState('');
    const [status, setStatus]   = useState('idle');
    const [file, setFile]       = useState(null);
    const [preview, setPreview] = useState(null);
    const fileInputRef          = useRef(null);

    const remaining   = MAX_LENGTH - text.length;
    const isOverLimit = remaining < 0;
    const isBusy      = status === 'compressing' || status === 'sending';

    useEffect(() => {
        if (!isOpen) {
            setText(''); setFile(null); setPreview(null); setStatus('idle');
        }
    }, [isOpen]);

    useEffect(() => {
        return () => { if (preview) URL.revokeObjectURL(preview); };
    }, [preview]);

    if (!isOpen) return null;

    const handleFileChange = async (e) => {
        const selected = e.target.files[0];
        if (!selected) return;
        e.target.value = '';
        setStatus('compressing');
        try {
            const compressed = await compressImage(selected);
            setFile(compressed);
            setPreview(URL.createObjectURL(compressed));
        } catch {
            alert('이미지 처리에 실패했습니다.');
        } finally {
            setStatus('idle');
        }
    };

    const handleSubmit = async () => {
        if (!text.trim() || isOverLimit || isBusy) return;
        setStatus('sending');
        try {
            await sendTelegramInquiry(text, file);
            setStatus('success');
            setTimeout(() => onClose(), 1500);
        } catch {
            alert('전송에 실패했습니다.');
            setStatus('idle');
        }
    };

    return ReactDOM.createPortal(
        <Overlay onClick={onClose}>
            <Container onClick={(e) => e.stopPropagation()}>

                {/* ── 헤더: 제목 + X ── */}
                <Header>
                    <Title>관리자에게 문의하기</Title>
                    <CloseBtn onClick={onClose} disabled={isBusy}>✕</CloseBtn>
                </Header>

                <SubText>에러 상황이나 궁금한 점을 남겨주세요.</SubText>

                {/* ── 텍스트 입력 (나머지 영역 전부) ── */}
                <TextArea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="내용을 입력하세요..."
                    disabled={isBusy}
                />
                <Counter $over={isOverLimit}>{remaining}자 남음</Counter>

                {/* ── 이미지 미리보기 ── */}
                {preview && (
                    <PreviewWrapper>
                        <PreviewImg src={preview} alt="첨부 이미지" />
                        <RemoveBtn onClick={() => { setFile(null); setPreview(null); }} disabled={isBusy}>✕</RemoveBtn>
                    </PreviewWrapper>
                )}

                {/* ── 푸터: 사진첨부 + 취소 + 보내기 ── */}
                <BottomRow>
                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
                    <AttachBtn onClick={() => fileInputRef.current?.click()} disabled={isBusy}>
                        {status === 'compressing' ? '압축 중...' : '📎 사진 첨부'}
                    </AttachBtn>
                    <BtnGroup>
                        <CancelBtn onClick={onClose} disabled={isBusy}>취소</CancelBtn>
                        <SendBtn onClick={handleSubmit} disabled={isBusy || isOverLimit || !text.trim()}>
                            {status === 'sending' ? '전송 중...' : status === 'success' ? '완료!' : '보내기'}
                        </SendBtn>
                    </BtnGroup>
                </BottomRow>

            </Container>
        </Overlay>,
        document.body
    );
};

export default TelegramPopup;

// ── Styled Components ──────────────────────────────────────────────────────────

const Overlay = styled.div`
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.65);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999;
    backdrop-filter: blur(4px);
    @media (max-width: 768px) { align-items: flex-end; }
`;

const Container = styled.div`
    display: flex; flex-direction: column;
    width: 420px; height: 400px;
    background: #1e293b;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    color: #e2e8f0;
    overflow: hidden;
    @media (max-width: 768px) {
        width: 100%; height: auto; min-height: 400px;
        border-radius: 20px 20px 0 0;
    }
`;

const Header = styled.div`
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 20px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    flex-shrink: 0;
`;

const Title = styled.span`
    font-size: 15px; font-weight: 600;
    color: #f1f5f9; letter-spacing: -0.01em;
`;

const CloseBtn = styled.button`
    background: none; border: none; cursor: pointer;
    color: #64748b; font-size: 16px; line-height: 1;
    padding: 2px 4px; border-radius: 4px;
    transition: color 0.15s;
    &:hover { color: #cbd5e1; }
`;

const SubText = styled.p`
    font-size: 12px; color: #64748b;
    padding: 10px 20px 0; margin: 0; flex-shrink: 0;
`;

const TextArea = styled.textarea`
    flex: 1;
    margin: 10px 20px 0;
    background: #0f172a;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 8px;
    color: #cbd5e1; font-size: 14px; line-height: 1.65;
    padding: 12px; resize: none;
    &::placeholder { color: #334155; }
    &:focus { outline: none; border-color: rgba(59, 130, 246, 0.4); }
`;

const Counter = styled.div`
    font-size: 11px; padding: 5px 20px 0;
    text-align: right; flex-shrink: 0;
    color: ${({ $over }) => $over ? '#f87171' : '#475569'};
`;

const PreviewWrapper = styled.div`
    position: relative; display: inline-block;
    margin: 8px 20px 0; flex-shrink: 0;
`;
const PreviewImg = styled.img`
    max-height: 80px; border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.1); display: block;
`;
const RemoveBtn = styled.button`
    position: absolute; top: 4px; right: 4px;
    background: rgba(0,0,0,0.6); color: white; border: none;
    border-radius: 50%; width: 18px; height: 18px;
    cursor: pointer; font-size: 10px;
    display: flex; align-items: center; justify-content: center;
`;

const BottomRow = styled.div`
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 20px 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    margin-top: 10px; flex-shrink: 0;
    @media (max-width: 768px) { padding-bottom: 24px; }
`;

const AttachBtn = styled.button`
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #94a3b8; border-radius: 6px;
    padding: 7px 13px; font-size: 13px; cursor: pointer;
    transition: all 0.15s;
    &:hover:not(:disabled) { border-color: rgba(255,255,255,0.25); color: #cbd5e1; }
    &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const BtnGroup = styled.div`display: flex; gap: 8px;`;

const CancelBtn = styled.button`
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #94a3b8; border-radius: 6px;
    padding: 7px 18px; font-size: 14px; cursor: pointer;
    transition: all 0.15s;
    &:hover:not(:disabled) { border-color: rgba(255,255,255,0.2); color: #cbd5e1; }
    &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const SendBtn = styled.button`
    background: #3b82f6; color: white; border: none;
    border-radius: 6px; padding: 7px 20px;
    font-size: 14px; font-weight: 500; cursor: pointer;
    transition: background 0.15s;
    &:hover:not(:disabled) { background: #2563eb; }
    &:disabled { background: #1e3a5f; color: #475569; cursor: not-allowed; }
`;
