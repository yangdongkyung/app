# 지켜줘 내 텅장, 내 필통!

필기구 및 사무 도구 현황을 관리하고, 중복 구매를 줄이기 위한 반응형 웹앱입니다.

## 실행

`index.html`을 브라우저에서 열면 바로 실행됩니다.

관리자 로그인:

- 관리자 아이디: `20020709`
- 비밀번호: `11223344`

회원가입한 사용자는 관리자 홈페이지의 회원 관리에서 승인해야 개인 현황판 저장, 공유, 후기 작성, 친구 요청, 쪽지 전송, PDF 업로드를 사용할 수 있습니다.

## 포함된 기능

- 메인, 로그인, 회원가입, 마이페이지
- 개인 현황판 저장 및 전체 공유 현황판 등록
- 공유 현황 댓글 및 대댓글
- 후기 게시판, 사진 등록, 해시태그, 검색, 최신순/댓글순/조회순 정렬
- 친구 요청, 수락/거절, 친구 목록, 친구 삭제
- 친구끼리 쪽지 보내기, 받은/보낸 쪽지함, 읽음 표시, 신고
- 관리자 회원 승인/정지, 게시글 숨김/삭제, 댓글 삭제, 친구 요청 관리, 쪽지 신고 관리
- 제작실 PDF 업로드 기록 및 PDF별 물품 입력표

## Firebase Realtime Database 용량 최소화

현재 파일은 바로 미리보기할 수 있도록 브라우저 저장소를 사용합니다. Firebase로 옮길 때는 Realtime Database에 큰 파일이나 중복 데이터를 넣지 않는 구조를 권장합니다.

- 비밀번호: Firebase Authentication 사용. Realtime Database에는 저장하지 않기
- 프로필 사진, 후기 사진, PDF 원본: Firebase Storage 사용. Realtime Database에는 `storagePath`와 필요한 메타데이터만 저장
- 사용자 정보: 게시글, 댓글, 쪽지마다 이름과 프로필을 복사하지 않고 `userId`만 저장한 뒤 `publicProfiles/{uid}`에서 조회
- 개인/공유 현황판: `/boards/{uid}`에 현황을 한 번만 저장하고, `/boardShares/{uid}`에는 공유 여부와 날짜만 저장
- 댓글/대댓글: 현황판이나 게시글 본문 안에 넣지 않고 `/boardComments/{uid}`, `/postComments/{postId}`로 분리
- 친구 관계: `/friendships/{uid}/{friendUid}: createdAt` 형태로 최소 저장
- 쪽지: 보낸 사람/받는 사람 id, 제목, 내용, 날짜, 읽음/삭제/신고 상태만 저장
- PDF 업로드: 파일명, Storage 경로, 업로드 날짜는 `/pdfUploads/{uid}/{pdfId}`에 저장하고, PDF별 입력 행은 `/pdfRows/{uid}/{pdfId}`에 분리

관련 파일:

- 상세 데이터 모델: `firebase-data-model.md`
- 보안 규칙 초안: `firebase.rules.json`
- Firebase 프로젝트 설정 자리: `firebase-config.js`

## Vercel 배포

정적 사이트로 배포하면 됩니다.

- Framework Preset: `Other`
- Build Command: 비워두기
- Output Directory: `.` 또는 이 폴더 경로
