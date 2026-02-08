import './style.css'
import * as Phaser from 'phaser'
import { GameScene } from './scenes/GameScene'
import { installFatalErrorOverlay } from './ui/fatalErrorOverlay'

installFatalErrorOverlay()

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 960,
  height: 600,
  backgroundColor: '#10131a',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [GameScene],
  render: {
    antialias: true,
    pixelArt: false,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
})

void game

