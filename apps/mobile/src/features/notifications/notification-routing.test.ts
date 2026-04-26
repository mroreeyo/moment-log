import {
  createNotificationResponseHandler,
  routeFromNotificationResponse,
} from './notification-routing';

describe('notification route mapping', () => {
  it('maps internal notification route to camera screen', () => {
    expect(
      routeFromNotificationResponse({
        notification: { request: { content: { data: { route: '/camera', groupId: 'g1' } } } },
      }),
    ).toBe('/camera');
  });

  it('ignores external or unknown routes', () => {
    expect(
      routeFromNotificationResponse({
        notification: { request: { content: { data: { route: 'https://example.com' } } } },
      }),
    ).toBeNull();
  });

  it('pushes only valid routes', () => {
    const pushed: string[] = [];
    const handler = createNotificationResponseHandler({ push: (route) => pushed.push(route) });

    handler({ notification: { request: { content: { data: { route: '/camera' } } } } });
    handler({ notification: { request: { content: { data: { route: '/vlog/p1' } } } } });

    expect(pushed).toEqual(['/camera']);
  });
});
