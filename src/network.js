import PeerModule from 'peerjs';

const Peer = (typeof window !== 'undefined' && window.Peer)
  ? window.Peer
  : (PeerModule && (PeerModule.Peer || PeerModule.default || PeerModule));

const ID_PREFIX = 'william-horror-v1-';
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class NetworkManager {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.roomCode = null;
    this.isConnected = false;
    this.broadcastChannel = null;

    this.onConnected = null;
    this.onDisconnected = null;
    this.onMessage = null;
    this.onError = null;

    this.lastSentTimes = {};
  }

  // Generate random 4-letter room code
  static generateRoomCode() {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
    }
    return code;
  }

  hostRoom(roomCode, callbacks = {}) {
    this.cleanup();
    this.isHost = true;
    this.roomCode = roomCode.toUpperCase().trim();
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
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      this.peer.on('open', (id) => {
        // Room registered on cloud signaling server
      });

      this.peer.on('connection', (connection) => {
        this.conn = connection;
        this.setupConnection();
      });

      this.peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
          if (this.onError) this.onError('Room code already in use. Please create a new room.');
        } else {
          if (this.onError) this.onError(err.message || 'Network error');
        }
      });
    } catch (e) {
      if (this.onError) this.onError('Failed to initialize P2P network: ' + e.message);
    }
  }

  joinRoom(roomCode, callbacks = {}) {
    this.cleanup();
    this.isHost = false;
    this.roomCode = roomCode.toUpperCase().trim();
    this.onConnected = callbacks.onConnected;
    this.onDisconnected = callbacks.onDisconnected;
    this.onMessage = callbacks.onMessage;
    this.onError = callbacks.onError;

    const targetPeerId = ID_PREFIX + this.roomCode;

    // Local tab-to-tab fallback
    try {
      this.broadcastChannel = new BroadcastChannel('horror-room-' + this.roomCode);
      this.broadcastChannel.onmessage = (event) => {
        this.handleIncomingData(event.data, 'broadcast');
      };
      // Send a handshake ping on broadcast channel
      setTimeout(() => {
        if (this.broadcastChannel && !this.isConnected) {
          this.broadcastChannel.postMessage({ type: 'SYS_BC_JOIN', sender: 'guest' });
        }
      }, 200);
    } catch (e) {}

    try {
      this.peer = new Peer({
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      this.peer.on('open', () => {
        this.conn = this.peer.connect(targetPeerId, {
          reliable: true
        });
        this.setupConnection();
      });

      this.peer.on('error', (err) => {
        if (err.type === 'peer-unavailable') {
          if (this.onError) this.onError('Room not found. Check the 4-letter code!');
        } else {
          if (this.onError) this.onError(err.message || 'Connection failed');
        }
      });
    } catch (e) {
      if (this.onError) this.onError('Failed to connect: ' + e.message);
    }
  }

  setupConnection() {
    if (!this.conn) return;

    this.conn.on('open', () => {
      this.isConnected = true;
      if (this.onConnected) this.onConnected(this.isHost);
    });

    this.conn.on('data', (data) => {
      this.handleIncomingData(data, 'webrtc');
    });

    this.conn.on('close', () => {
      this.isConnected = false;
      if (this.onDisconnected) this.onDisconnected();
    });

    this.conn.on('error', (err) => {
      if (this.onError) this.onError(err.message);
    });
  }

  handleIncomingData(data, source = 'webrtc') {
    if (!data) return;

    // Handle internal broadcast channel handshake
    if (data.type === 'SYS_BC_JOIN' && this.isHost) {
      if (this.broadcastChannel) {
        this.broadcastChannel.postMessage({ type: 'SYS_BC_ACCEPT' });
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
        if (this.onConnected) this.onConnected(this.isHost);
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
    this.isConnected = false;
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
