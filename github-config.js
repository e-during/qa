// ============================================================
// GitHub 저장소 연동 설정 (모바일 외부접속용 — 사내 GitLab과는 별개)
// - PC 업로드 시 GitLab(사내망) + GitHub(외부용) 동시 저장
// - 모바일(m.html / m_dashboard.html)은 이 GitHub 저장소를 우선 조회
//
// ⚠️ 보안 주의
// - 이 파일은 정적 페이지 소스코드에 그대로 노출됩니다.
// - 토큰이 유출됐다고 판단되면 즉시 GitHub > Settings > Developer settings >
//   Personal access tokens 에서 해당 토큰을 Revoke(삭제) 후 재발급하세요.
// - 토큰 권한은 반드시 "이 저장소(during-mobile-data) 전용" + "Contents: Read and write"만
//   부여된 상태를 유지해야 합니다 (계정 전체 권한 토큰 사용 금지).
// ============================================================
window.GITHUB_CONFIG = {
  owner: 'wwf3786-oss',
  repo: 'during-mobile-data',
  branch: 'main',
  token: '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',
  dataDir: 'data'
};
