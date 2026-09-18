import React from 'react';

export function TopblastLogo({compact=false}) {
  return <div className={`brand ${compact?'compact':''}`} aria-label="Topblast">
    <img src="/topblast-mark-512.png" alt="" aria-hidden="true"/>
    <span><strong>TOP</strong><em>BLAST</em></span>
  </div>;
}
