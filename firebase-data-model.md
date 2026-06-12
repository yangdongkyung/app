# Firebase Realtime Database 용량 최소화 설계

Realtime Database에는 작은 텍스트 메타데이터만 저장하고, 큰 파일은 Firebase Storage에 저장합니다.

## 원칙

- 비밀번호는 Firebase Authentication에만 맡기고 DB에는 저장하지 않습니다.
- 프로필 사진, 후기 사진, PDF 원본은 Storage에 저장하고 DB에는 `storagePath` 또는 다운로드 URL만 저장합니다.
- PDF별 사용자가 입력한 물품 행은 원본 파일 메타데이터와 분리해 `/pdfRows/{uid}/{pdfId}`에 저장합니다.
- 이름, 별명, 프로필 사진은 게시글·댓글·쪽지마다 복사하지 않고 `userId`만 저장합니다.
- 개인 현황판과 공유 현황판을 따로 저장하지 않습니다. 현황판은 `/boards/{uid}`에 한 번만 저장하고, 공유 여부는 `/boardShares/{uid}`에 플래그로 저장합니다.
- 댓글은 현황판·게시글 본문 안에 넣지 않고 별도 경로에 둡니다. 목록 조회 시 큰 댓글 묶음을 매번 같이 내려받지 않게 됩니다.
- 친구 관계는 `/friendships/{uid}/{friendUid}: createdAt` 형태로 저장해 쪽지 전송 권한 확인을 빠르게 합니다.
- 오래된 쪽지, 신고 처리 완료 내역, 오래된 PDF 업로드 메타데이터는 운영 정책에 따라 정리합니다.

## 권장 구조

```json
{
  "users": {
    "uid1": {
      "name": "홍길동",
      "studentId": "20260001",
      "approved": true,
      "suspended": false,
      "createdAt": 1791817200000
    }
  },
  "publicProfiles": {
    "uid1": {
      "nickname": "필통요정",
      "photoPath": "profiles/uid1.jpg",
      "studentMask": "20****01"
    }
  },
  "studentIndex": {
    "20260001": "uid1"
  },
  "boards": {
    "uid1": {
      "row1": { "item": "샤프", "qty": 3, "note": "검정색" },
      "row2": { "item": "노트", "qty": 1, "note": "사용 중" }
    }
  },
  "boardShares": {
    "uid1": {
      "active": true,
      "createdAt": 1791817200000,
      "updatedAt": 1791817300000
    }
  },
  "boardComments": {
    "uid1": {
      "comment1": {
        "userId": "uid2",
        "text": "공동 사용 가능해요?",
        "createdAt": 1791817400000,
        "replies": {
          "reply1": {
            "userId": "uid1",
            "text": "가능합니다.",
            "createdAt": 1791817500000
          }
        }
      }
    }
  },
  "posts": {
    "post1": {
      "userId": "uid1",
      "title": "샤프 후기",
      "content": "필기감이 좋아요.",
      "photoPath": "reviews/post1.jpg",
      "tags": { "샤프": true, "필기감": true },
      "viewCount": 12,
      "commentCount": 2,
      "hidden": false,
      "createdAt": 1791817600000
    }
  },
  "postComments": {
    "post1": {
      "comment1": {
        "userId": "uid2",
        "text": "어디서 샀어요?",
        "createdAt": 1791817700000
      }
    }
  },
  "friendRequests": {
    "request1": {
      "fromId": "uid1",
      "toId": "uid2",
      "status": "pending",
      "createdAt": 1791817800000
    }
  },
  "friendships": {
    "uid1": { "uid2": 1791817900000 },
    "uid2": { "uid1": 1791817900000 }
  },
  "messages": {
    "message1": {
      "fromId": "uid1",
      "toId": "uid2",
      "title": "필통 확인",
      "body": "샤프 여분 있어?",
      "createdAt": 1791818000000,
      "readAt": 0,
      "deletedBySender": false,
      "deletedByReceiver": false,
      "reported": false
    }
  },
  "pdfUploads": {
    "uid1": {
      "pdf1": {
        "fileName": "준비물.pdf",
        "storagePath": "pdfs/uid1/pdf1.pdf",
        "createdAt": 1791818100000
      }
    }
  },
  "pdfRows": {
    "uid1": {
      "pdf1": {
        "row1": { "item": "풀", "qty": 1, "note": "구매 예정" }
      }
    }
  }
}
```

## 더 줄이고 싶을 때

필드명을 짧게 바꾸면 저장 용량을 더 줄일 수 있습니다. 다만 앱 코드 가독성은 낮아집니다.

| 의미 | 읽기 쉬운 키 | 짧은 키 |
| --- | --- | --- |
| 사용자 id | `userId` | `u` |
| 제목 | `title` | `ti` |
| 내용 | `content`, `body` | `tx` |
| 생성일 | `createdAt` | `ct` |
| 수정일 | `updatedAt` | `ut` |
| 사진 경로 | `photoPath` | `img` |
| 수량 | `qty` | `q` |
| 비고 | `note` | `n` |

처음 개발과 발표 단계에서는 읽기 쉬운 키를 쓰고, 실제 이용자가 많아지면 짧은 키로 마이그레이션하는 편이 안전합니다.
