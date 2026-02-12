import React from 'react';

const Header = ({ restartGame, health, jumpCount, milkCount, orientation, gameSize }) => {
  const headerHeight = orientation === 'portrait' ? '50px' : '40px';
  const fontSize = orientation === 'portrait' ? '1rem' : '0.8rem';

  return (
    <div style={{
      width: `${gameSize.width}px`,
      height: headerHeight,
      backgroundColor: '#F5E5DC',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 10px',
      boxSizing: 'border-box',
      position: 'relative',
      zIndex: 1000,
      margin: '0 auto',
    }}>
      <h1
        style={{
          cursor: 'pointer',
          margin: 0,
          fontSize: fontSize,
          whiteSpace: 'nowrap'
        }}
        onClick={restartGame}
      >
        Maze Whiskers
      </h1>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          fontSize: fontSize
        }}>
          <span style={{ marginRight: '5px' }}>HP</span>
          <div style={{
            width: '60px',
            height: '15px',
            backgroundColor: '#ddd',
            borderRadius: '10px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${health}%`,
              height: '100%',
              backgroundColor: 'red',
              borderRadius: '10px',
              transition: 'width 0.5s'
            }}></div>
          </div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          fontSize: fontSize
        }}>
          <span style={{ marginRight: '5px' }}>Jump</span>
          <span>{jumpCount}</span>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          fontSize: fontSize
        }}>
          <span style={{ marginRight: '5px' }}>Milk</span>
          <span>{milkCount}</span>
        </div>
      </div>
    </div>
  );
};

export default Header;