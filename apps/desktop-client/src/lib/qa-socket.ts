import { io, Socket } from 'socket.io-client';

/** Socket.IO client for the dedicated /qa namespace */
export class QaSocketClient {
  private socket: Socket | null = null;

  public onQuestionPending: ((q: unknown) => void) | null = null;
  public onQuestionApproved: ((q: unknown) => void) | null = null;
  public onQuestionRejected: ((d: { id: string }) => void) | null = null;
  public onQuestionAnswered: ((q: unknown) => void) | null = null;
  public onQuestionUpvoted: ((d: { id: string; upvotes: number }) => void) | null = null;

  connect(signalToken: string): void {
    this.disconnect();
    const { protocol, host } = window.location;
    const url = `${protocol}//${host}`;
    this.socket = io(`${url}/qa`, {
      path: '/socket.io',
      auth: { token: signalToken },
      transports: ['websocket'],
    });

    this.socket.on('question-pending', (q) => this.onQuestionPending?.(q));
    this.socket.on('question-approved', (q) => this.onQuestionApproved?.(q));
    this.socket.on('question-rejected', (d) => this.onQuestionRejected?.(d));
    this.socket.on('question-answered', (q) => this.onQuestionAnswered?.(q));
    this.socket.on('question-upvoted', (d) => this.onQuestionUpvoted?.(d));
  }

  submitQuestion(text: string): Promise<{ id: string; status: string }> {
    return new Promise((resolve, reject) => {
      this.socket?.emit('submit-question', { text }, (ack: { id: string; status: string }) => {
        if (ack?.id) resolve(ack);
        else reject(new Error('Submit failed'));
      });
    });
  }

  approveQuestion(questionId: string): void {
    this.socket?.emit('approve-question', { questionId });
  }

  rejectQuestion(questionId: string): void {
    this.socket?.emit('reject-question', { questionId });
  }

  answerQuestion(questionId: string, answer: string): void {
    this.socket?.emit('answer-question', { questionId, answer });
  }

  upvoteQuestion(questionId: string): void {
    this.socket?.emit('upvote-question', { questionId });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}
