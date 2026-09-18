import React from 'react';

export function TopblastLogo({compact=false}) {
  return <div className={`brand ${compact?'compact':''}`} aria-label="Topblast">
    <svg viewBox="0 0 44 44" role="img" aria-hidden="true"><path d="M7 33.5 21.2 8h15.5L22.4 33.5H7Z" fill="none" stroke="currentColor" strokeWidth="3"/><path d="M8 28h21" stroke="currentColor" strokeWidth="3"/><path d="m27.5 4 8.8 4.8-8.8 5.2 2.3-5.2-2.3-4.8Z" fill="#b6ff78"/></svg>
    <span>TOPBLAST</span>
  </div>;
}
