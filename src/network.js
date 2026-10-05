import PeerModule from 'peerjs';

const Peer = (typeof window !== 'undefined' && window.Peer)
  ? window.Peer
  : (PeerModule && (PeerModule.Peer || PeerModule.default || PeerModule));

const ID_PREFIX = 'wh2-';
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];

export class NetworkManager {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.roomCode = null;
    this.isConnected = false;
    this.broadcastChannel = null;
    this.bcInterval = null;
    this.isDestroyed = false;

    this.onConnected = null;
    this.onDisconnected = null;
    this.onMessage = null;
    this.onError = null;
  }

  // Generate random 4-letter room code (omitting ambiguous characters like 0, O, 1, I)
  static generateRoomCode() {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
    }
    return code;
  }

  hostRoom(roomCode, callbacks = {}) {
    this.cleanup();
    this.isDestroyed = false;
    this.isHost = true;
    this.roomCode = (roomCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    this.onConnected = callbacks.onConnected;
    this.onDisconnected = callbacks.onDisconnected;
    this.onMessage = callbacks.onMessage;
    this.onError = callbacks.onError;

    const fullPeerId = ID_PREFIX + this.roomCode;

    // Local tab-to-tab fallback
    try {
      this.broadcastChannel = new BroadcastChannel('horror-room-' + this.roomCode);
      this.broadcastChannel.onmessage = (event) => {
        this.handleIncomingData(event.data, 'broadcast');
      };
    } catch (e) {}

    try {
      this.peer = new Peer(fullPeerId, {
        debug: 1,
        config: { iceServers: ICE_SERVERS }
      });

      this.peer.on('open', (id) => {
        console.log('[Network] Host room registered on cloud server:', id);
        if (callbacks.onReady) callbacks.onReady(this.roomCode);
        if (this.broadcastChannel) {
          try {
            this.broadcastChannel.postMessage({ type: 'SYS_BC_HOST_READY' });
          } catch (e) {}
        }
      });

      this.peer.on('connection', (connection) => {
        console.log('[Network] Inbound player connection received');
        this.conn = connection;
        this.setupConnection();
      });

      this.peer.on('error', (err) => {
        console.warn('[Network] Host peer error:', err);
        if (err.type === 'unavailable-id') {
          if (this.onError) this.onError('Room code in use. Please click Create Room again.');
        } else {
          if (this.onError) this.onError(err.message || 'Host network error');
        }
      });
    } catch (e) {
      if (this.onError) this.onError('Failed to initialize P2P network: ' + e.message);
    }
  }

  joinRoom(roomCode, callbacks = {}) {
    this.cleanup();
    this.isDestroyed = false;
    this.isHost = false;
    this.roomCode = (roomCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    this.onConnected = callbacks.onConnected;
    this.onDisconnected = callbacks.onDisconnected;
    this.onMessage = callbacks.onMessage;
    this.onError = callbacks.onError;

    const targetPeerId = ID_PREFIX + this.roomCode;

    // Local tab-to-tab fallback with persistent discovery pings
    try {
      this.broadcastChannel = new BroadcastChannel('horror-room-' + this.roomCode);
      this.broadcastChannel.onmessage = (event) => {
        this.handleIncomingData(event.data, 'broadcast');
      };

      // Send initial join ping
      this.broadcastChannel.postMessage({ type: 'SYS_BC_JOIN', sender: 'guest' });

      // Keep broadcasting ping until connected
      this.bcInterval = setInterval(() => {
        if (this.broadcastChannel && !this.isConnected) {
          try {
            this.broadcastChannel.postMessage({ type: 'SYS_BC_JOIN', sender: 'guest' });
          } catch (e) {}
        } else {
          clearInterval(this.bcInterval);
          this.bcInterval = null;
        }
      }, 350);
    } catch (e) {}

    // WebRTC connection with auto-retry loop
    let retryCount = 0;
    const maxRetries = 4;

    const attemptConnect = () => {
      if (this.isConnected || this.isDestroyed) return;

      if (callbacks.onProgress) {
        const text = retryCount === 0
          ? `Searching for room [${this.roomCode}]...`
          : `Connecting to room [${this.roomCode}] (attempt ${retryCount + 1}/${maxRetries})...`;
        callbacks.onProgress(text);
      }

      if (this.peer) {
        try { this.peer.destroy(); } catch (e) {}
        this.peer = null;
      }

      try {
        this.peer = new Peer({
          debug: 1,
          config: { iceServers: ICE_SERVERS }
        });

        this.peer.on('open', (guestId) => {
          if (this.isConnected || this.isDestroyed) return;
          console.log('[Network] Guest client initialized:', guestId, '-> connecting to target:', targetPeerId);
          this.conn = this.peer.connect(targetPeerId, {
            reliable: true
          });
          this.setupConnection();
        });

        this.peer.on('error', (err) => {
          if (this.isConnected || this.isDestroyed) return;
          console.warn('[Network] Guest peer error:', err);

          if (err.type === 'peer-unavailable') {
            if (retryCount < maxRetries - 1) {
              retryCount++;
              setTimeout(attemptConnect, 1200);
            } else {
              if (this.onError) {
                this.onError(`Room [${this.roomCode}] not found. Ensure Host clicked "CREATE ROOM" and the 4-letter code is correct.`);
              }
            }
          } else {
            if (retryCount < maxRetries - 1) {
              retryCount++;
              setTimeout(attemptConnect, 1200);
            } else {
              if (this.onError) this.onError(err.message || 'Connection failed. Please verify code.');
            }
          }
        });
      } catch (e) {
        if (this.onError) this.onError('Failed to connect: ' + e.message);
      }
    };

    attemptConnect();
  }

  setupConnection() {
    if (!this.conn) return;

    this.conn.on('open', () => {
      console.log('[Network] WebRTC data channel active!');
      this.isConnected = true;
      if (this.bcInterval) {
        clearInterval(this.bcInterval);
        this.bcInterval = null;
      }
      if (this.onConnected) this.onConnected(this.isHost);
    });

    this.conn.on('data', (data) => {
      this.handleIncomingData(data, 'webrtc');
    });

    this.conn.on('close', () => {
      console.log('[Network] Peer connection closed');
      this.isConnected = false;
      if (this.onDisconnected) this.onDisconnected();
    });

    this.conn.on('error', (err) => {
      console.warn('[Network] Conn error:', err);
      if (!this.isConnected && this.onError) this.onError(err.message);
    });
  }

  handleIncomingData(data, source = 'webrtc') {
    if (!data) return;

    // Handle local broadcast channel handshake
    if (data.type === 'SYS_BC_JOIN' && this.isHost) {
      if (this.broadcastChannel) {
        try {
          this.broadcastChannel.postMessage({ type: 'SYS_BC_ACCEPT' });
        } catch (e) {}
      }
      if (!this.isConnected) {
        this.isConnected = true;
        if (this.onConnected) this.onConnected(this.isHost);
      }
      return;
    }

    if (data.type === 'SYS_BC_ACCEPT' && !this.isHost) {
      if (!this.isConnected) {
        this.isConnected = true;
        if (this.bcInterval) {
          clearInterval(this.bcInterval);
          this.bcInterval = null;
        }
        if (this.onConnected) this.onConnected(this.isHost);
      }
      return;
    }

    if (data.type === 'SYS_BC_HOST_READY' && !this.isHost) {
      if (this.broadcastChannel && !this.isConnected) {
        try {
          this.broadcastChannel.postMessage({ type: 'SYS_BC_JOIN', sender: 'guest' });
        } catch (e) {}
      }
      return;
    }

    if (this.onMessage) {
      this.onMessage(data);
    }
  }

  send(data) {
    if (!data) return;

    let sent = false;
    if (this.conn && this.conn.open) {
      try {
        this.conn.send(data);
        sent = true;
      } catch (e) {}
    }

    // Mirror to BroadcastChannel for instant local testing
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(data);
        sent = true;
      } catch (e) {}
    }

    return sent;
  }

  cleanup() {
    this.isDestroyed = true;
    this.isConnected = false;
    if (this.bcInterval) {
      clearInterval(this.bcInterval);
      this.bcInterval = null;
    }
    if (this.conn) {
      try { this.conn.close(); } catch (e) {}
      this.conn = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
      this.peer = null;
    }
    if (this.broadcastChannel) {
      try { this.broadcastChannel.close(); } catch (e) {}
      this.broadcastChannel = null;
    }
  }
}
