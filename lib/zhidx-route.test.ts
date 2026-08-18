import { beforeEach, describe, expect, it, vi } from 'vitest';

import { route } from './zhidx-route';

const { ofetchMock } = vi.hoisted(() => ({
    ofetchMock: vi.fn(),
}));

vi.mock('@/utils/ofetch', () => ({ default: ofetchMock }));
vi.mock('@/utils/cache', () => ({
    default: {
        tryGet: vi.fn((_key, loader) => loader()),
    },
}));

const listResponse = {
    state: 0,
    result: [
        {
            link: 'https://zhidx.com/p/585603.html',
            title: '列表标题',
            desp: '列表摘要',
        },
    ],
};

describe('/zhidx/latest', () => {
    beforeEach(() => {
        ofetchMock.mockReset();
    });

    it('returns full article metadata and normalized URLs', async () => {
        ofetchMock.mockResolvedValueOnce(listResponse).mockResolvedValueOnce(`
            <div class="post-title">文章标题</div>
            <div class="post-related">
                <span class="leibie"><a>人工智能</a><a>智东西</a></span>
                <span class="time">2026/08/17</span>
            </div>
            <div class="author-name">王涵</div>
            <div class="post-content">
                <p>正文</p><img src="//oss.zhidx.com/image.jpg"><a href="/about">关于</a>
                <script>bad()</script>
            </div>
        `);

        const feed = await route.handler({} as never);

        if (!feed || feed instanceof Response) {
            throw new TypeError('Expected RSSHub feed data');
        }
        const [item] = feed.item ?? [];
        if (!item || !(item.pubDate instanceof Date)) {
            throw new TypeError('Expected a dated RSSHub item');
        }

        expect(feed.item).toHaveLength(1);
        expect(item).toMatchObject({
            title: '文章标题',
            link: 'https://zhidx.com/p/585603.html',
            guid: 'https://zhidx.com/p/585603.html',
            author: '王涵',
            category: ['人工智能', '智东西'],
        });
        expect(item.pubDate).toBeInstanceOf(Date);
        expect(item.pubDate.getUTCFullYear()).toBe(2026);
        expect(item.description).toContain('https://oss.zhidx.com/image.jpg');
        expect(item.description).toContain('https://zhidx.com/about');
        expect(item.description).not.toContain('<script>');
    });

    it('fails instead of returning an empty healthy feed', async () => {
        ofetchMock.mockResolvedValueOnce(listResponse).mockRejectedValueOnce(new Error('upstream failed'));

        await expect(route.handler({} as never)).rejects.toThrow('No usable Zhidx articles');
    });
});
