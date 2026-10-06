/** Original pixel illustrations. No external assets or proprietary reference artwork. */
export function PixelArt({
  kind = 'tree',
  className = '',
}: {
  kind?: 'tree' | 'server' | 'chip' | 'ledger' | 'cloud' | 'shield';
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 160 160"
      fill="none"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {kind === 'tree' ? (
        <>
          <path
            fill="#ffb000"
            d="M64 8h32v16H64zM48 24h64v16H48zM32 40h96v16H32zM16 56h128v24H16z"
          />
          <path fill="#ff8200" d="M16 80h128v16H16zM32 96h96v16H32zM48 112h64v16H48z" />
          <path fill="#ff501f" d="M72 72h16v80H72zM48 144h64v8H48z" />
          <path fill="#ca3619" d="M88 72h8v80h-8z" />
        </>
      ) : kind === 'server' ? (
        <>
          <path fill="#a8d4fb" d="M40 8h80v16H40zM24 24h112v128H24z" />
          <path fill="#246fa8" d="M32 40h96v32H32zM32 80h96v32H32zM32 120h96v16H32z" />
          <path fill="#fff" d="M40 48h8v8h-8zM40 88h8v8h-8z" />
          <path fill="#ff8200" d="M88 48h32v8H88zM88 88h32v8H88z" />
          <path fill="#12466c" d="M128 24h8v128h-8z" />
        </>
      ) : kind === 'chip' ? (
        <>
          <path
            stroke="#246fa8"
            strokeWidth="8"
            d="M48 8v144M80 8v144M112 8v144M8 48h144M8 80h144M8 112h144"
          />
          <path fill="#a8d4fb" d="M24 24h112v112H24z" />
          <path fill="#246fa8" d="M40 40h80v80H40z" />
          <path
            fill="#ffb000"
            d="M64 48h40v16H64zM56 64h40v16H56zM72 80h32v16H72zM56 96h32v16H56z"
          />
        </>
      ) : kind === 'ledger' ? (
        <>
          <path fill="#b83418" d="M32 16h104v136H32z" />
          <path fill="#ff8200" d="M24 8h104v128H24z" />
          <path fill="#ffb000" d="M40 16h80v112H40z" />
          <path fill="#fff5d6" d="M56 32h48v8H56zM56 48h48v8H56zM56 64h32v8H56z" />
          <path stroke="#19191c" strokeWidth="8" d="m56 96 16 16 32-32" />
          <path fill="#fff5d6" d="M40 136h88v8H40z" />
        </>
      ) : kind === 'shield' ? (
        <>
          <path
            fill="#a8d4fb"
            d="M32 16h96v16h16v64h-16v24h-16v16H96v16H64v-16H48v-16H32V96H16V32h16z"
          />
          <path fill="#246fa8" d="M40 32h80v56h-16v24H88v16H72v-16H56V88H40z" />
          <path stroke="#ffb000" strokeWidth="12" d="m56 64 16 16 32-32" />
        </>
      ) : (
        <>
          <path fill="#a8d4fb" d="M48 32h48v16h32v16h16v48H16V64h16V48h16z" />
          <path fill="#246fa8" d="M16 104h128v16H16z" />
          <path fill="#ff8200" d="M72 72h16v72H72zM56 128h48v16H56z" />
          <path fill="#fff" d="M48 48h32v8H48z" />
        </>
      )}
    </svg>
  );
}
