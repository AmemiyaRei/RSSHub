import { load } from 'cheerio';

import type { Route } from '@/types';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

type ListItem = {
    link: string;
    title: string;
    desp?: string;
};

type ListResponse = {
    state: number;
    result: ListItem[];
};

export const route: Route = {
    path: '/latest',
    categories: ['new-media'],
    example: '/zhidx/latest',
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['zhidx.com'],
            target: '/latest',
        },
    ],
    name: '最新文章',
    maintainers: ['AmemiyaRei'],
    handler,
    url: 'zhidx.com',
};

async function handler() {
    const rootUrl = 'https://zhidx.com';
    const response = await ofetch<ListResponse>(`${rootUrl}/wp-admin/admin-ajax.php`, {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            action: 'category_list',
            page: '0',
        }).toString(),
        parseResponse: JSON.parse,
    });

    if (response.state !== 0 || !Array.isArray(response.result)) {
        throw new Error('Unexpected response from Zhidx article list API');
    }

    const results = await Promise.allSettled(
        response.result.map((entry) =>
            cache.tryGet(entry.link, async () => {
                const detailResponse = await ofetch(entry.link);
                const $ = load(detailResponse);
                const content = $('.post-content').first();
                const title = $('.post-title').first().text().trim() || entry.title;
                const date = $('.post-related .time').first().text().trim();

                if (!date || content.length === 0) {
                    throw new Error(`Incomplete Zhidx article: ${entry.link}`);
                }

                content.find('script, style').remove();
                content.find('[src]').each((_, element) => {
                    const value = $(element).attr('src');
                    if (value) {
                        $(element).attr('src', new URL(value, rootUrl).href);
                    }
                });
                content.find('[href]').each((_, element) => {
                    const value = $(element).attr('href');
                    if (value) {
                        $(element).attr('href', new URL(value, rootUrl).href);
                    }
                });

                return {
                    title,
                    link: entry.link,
                    guid: entry.link,
                    pubDate: parseDate(date),
                    author: $('.author-name').first().text().trim() || undefined,
                    category: $('.post-related .leibie a')
                        .toArray()
                        .map((element) => $(element).text().trim())
                        .filter(Boolean),
                    description: content.html() || entry.desp || '',
                };
            })
        )
    );
    const items = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));

    if (items.length === 0) {
        throw new Error('No usable Zhidx articles were returned');
    }

    return {
        title: '智东西 - 最新文章',
        link: rootUrl,
        item: items,
    };
}
