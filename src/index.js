// @flow
// 
import "core-js/features/url";

const { distance } = require('fastest-levenshtein')

export let EXTENSION_ID="641c55ca-ff9b-4279-9278-fd304aba6aad";

class ChapterListItem {
    number: string;
    // Number is the chapter number. Could be an actual number like "1" or could
    // be a special chapter like "EX" or "Omake".
    //
    title: string;
    // Name is the short title of the chapter.
    // 
    description: string;
    // Description is the longer description of the chapter. May be blank
    // depending on the way the website handles information about chapters.
    // 
    identifier: string;
    // Identifier is a source-specific identifier. Could be an id like "1234" or
    // anything that makes sense for this source. This identifier will be
    // provided in getChapter call as chapterIdentifier to retrieve the chapter
    // pages.
    // 
    group: ?string
    // Optional: Scanalation group if one exists.
    // 
    variant: ?string
    // Optional: Set variant if there are multiple versions of the same chapter
    //           and group is not present or not enough to differintiate.
    //
    created: ?Date
    // Optional: Date created as a string if it exists.

    updated: ?Date
    // Optional: Date updated as a string if it exists.

    published: ?Date
    // Optional: Date of original chapter's publication as a string if it exists.

    constructor({
        number,
        identifier,
        title,
        description = "",
        group = null,
        variant = null,
        created = null,
        updated = null,
        published = null,
    }: {
        number: string,
        identifier: string,
        title: string,
        description?: string,
        group?: ?string,
        variant?: ?string,
        created?: ?Date,
        updated?: ?Date,
        published?: ?Date,
    }) {
        this.number = number;
        this.identifier = identifier;
        this.title = title;
        this.description = description;
        this.group = group;
        this.variant = variant;
        this.created = created;
        this.updated = updated;
        this.published = published;
    }
}

class ChapterList {
    chapters: Array<ChapterListItem>;
    // Chapters contains all the chapters for a given manga series.
    //

    constructor({ chapters }: { chapters: Array<ChapterListItem> }) {
        this.chapters = chapters;
    }
}


type PageDataHandler = (string) => (string);

class PageData {
    version: string = "1.0.0"
    highUrl: string
    lowUrl: ?string
    highHandler: ?PageDataHandler
    lowHandler: ?PageDataHandler

    constructor({
        highUrl,
        lowUrl = null,
        highHandler = null,
        lowHandler = null,
    }: {
        highUrl: string,
        lowUrl?: ?string,
        highHandler?: ?PageDataHandler,
        lowHandler?: ?PageDataHandler,
    }) {
        this.highUrl = highUrl;
        this.lowUrl = lowUrl;
        this.highHandler = highHandler;
        this.lowHandler = lowHandler;
    }
}

class ChapterData {
    version: string = "2.0.0"

    pages: Array<PageData>

    constructor({ pages }: { pages: Array<PageData> }) {
        this.pages = pages
    }
}

class MangaSeries {
    name: string;
    // Name is the name of the manga series.
    // 
    identifier: string;
    // Identifier is the id or unique identifier for this manga series on this
    // source.
    // 
    coverUrl: ?string;
    // NOTE: Optional
    // The coverUrl if one exists. Used to help users identify best matches.
    ranking: number;
    // NOTE: Optional
    // Ranking is the a representation of the likelyhood of this result being
    // the correct match. 0 being the best match and Number.MAX_SAFE_INTEGER
    // being the worst match. All negative numbers will be treated as equal.
    // 

    constructor({
        name,
        identifier,
        coverUrl = null,
        ranking = -1,
    }: {
        name: string,
        identifier: string,
        coverUrl?: ?string,
        ranking?: number,
    }) {
        this.name = name;
        this.identifier = identifier;
        this.coverUrl = coverUrl;
        this.ranking = ranking;
    }
}

class MangaSeriesList {
    results: Array<MangaSeries> = [];
    // Results is the list of all MangaSeries objects which match this query in
    // a searchManga call.

    constructor({ results = [] }: { results: Array<MangaSeries> }) {
        this.results = results;
    }
}

const baseUrl = "https://jumpg-webapi.tokyo-cdn.com/api"

function filterManga(query: string, mangaList: Array<MangaSeries>): Array<MangaSeries> {
    const distances = mangaList.map(x => [distance(query, x.name), x]);
    const top3 = distances.sort((x, y) => x[0] - y[0]).slice(0, 3);
    return top3.map((x, i) => {
        let item = x[1];
        item.ranking = i;
        return item;
    });
}

export async function searchManga(seriesName: string): Promise<MangaSeriesList> {
    const finalUrl = new URL(
        `${baseUrl}/title_list/allV2`
    );

    const searchParams = new URLSearchParams({
        format: "json"
    });

    finalUrl.search = searchParams.toString();

    const response = await fetch(finalUrl);
    const json = await response.json();

    const formatted = json.success.allTitlesViewV2.AllTitlesGroup.map(data => {
        // NOTE: No language is english for MangaPlus
        // 
        const engTitle = data.titles.find(title => !title.language);
        if (!engTitle) {
            return null;
        }

        const newSeries = new MangaSeries({
            identifier: engTitle.titleId,
            name: data.theTitle,
            coverUrl: engTitle.portraitImageUrl,
        });
        return newSeries;
    }).filter(x => x);

    const filtered = filterManga(seriesName, formatted);

    return new MangaSeriesList({
        results: filtered,
    });
}

export async function listChapters(seriesIdentifier: string): Promise<ChapterList> {
    const finalUrl = new URL(
        `${baseUrl}/title_detailV2`
    );

    const searchParams = new URLSearchParams({
        format: "json",
        title_id: seriesIdentifier,
    });

    finalUrl.search = searchParams.toString();

    const response = await fetch(finalUrl);
    const json = await response.json();

    const chapGroups = json.success.titleDetailView.chapterListGroup;

    const allChaps = chapGroups.flatMap(item => {
        let availChaps: Array<Array<{
            name: string,
            startTimeStamp: number,
            chapterId: number,
            subTitle: string,
        }>> = [];
        if (item.firstChapterList) {
            availChaps = availChaps.concat(item.firstChapterList);
        }
        if (item.midChapterList) {
            availChaps = availChaps.concat(item.midChapterList);
        }
        if (item.lastChapterList) {
            availChaps = availChaps.concat(item.lastChapterList);
        }

        return availChaps;
    });

    const formatted = allChaps.map(data => {
        const number = data.name.replace("#", "");
        const startDate = new Date(data.startTimeStamp * 1000);

        return new ChapterListItem({
            identifier: data.chapterId,
            title: data.subTitle,
            number: number,
            created: startDate,
            updated: startDate,
            published: startDate,
        });
    });

    const chapList = new ChapterList({
        chapters: formatted,
    });

    return chapList;
}

function xorDecrypt(key: string, data: string): string {
    const length = key.length;
    let decrypted = [];
    for (let i = 0; i < data.length; i++) {
        const c = data.charCodeAt(i);
        const ec = key.charCodeAt(i % length);
        decrypted.push(String.fromCharCode(c ^ ec));
    }
    return decrypted.join("");
}

export async function getChapter(chapterIdentifier: string): Promise<ChapterData> {
    const finalUrl = new URL(
        `${baseUrl}/manga_viewer`
    );

    let searchParams = new URLSearchParams({
        format: "json",
        split: "yes",
        chapter_id: chapterIdentifier,
        img_quality: "high"
    });

    finalUrl.search = searchParams.toString();

    let response = await fetch(finalUrl);
    let json = await response.json();

    const highPages = json.success.mangaViewer.pages;

    searchParams = new URLSearchParams({
        format: "json",
        split: "yes",
        chapter_id: chapterIdentifier,
        img_quality: "low"
    });

    finalUrl.search = searchParams.toString();

    response = await fetch(finalUrl);
    json = await response.json();
    const lowPages = json.success.mangaViewer.pages;

    let allPages = [];
    for (var i = 0; i < highPages.length; i++) {
        const high = highPages[i].mangaPage;
        const low = lowPages[i].mangaPage;
        if (!high || !low) {
            continue;
        }

        allPages.push({
            high,
            low,
        })
    }

    // const allPages = highPages.map((page, i) => ({
    //     high: page.mangaPage,
    //     low: json.success.mangaViewer.pages[i].mangaPage,
    // }));

    // console.log(allPages);
    const pageDatas = allPages.map((pages) => {
        // console.log(pages);
        const {low, high} = pages;
        const highUrl = high.imageUrl;
        const lowUrl = low.imageUrl;
        const highHandler = (pageData: string) => xorDecrypt(high.encryptionKey, pageData);
        const lowHandler = (pageData: string) => xorDecrypt(low.encryptionKey, pageData);

        return new PageData({
            highUrl,
            lowUrl,
            highHandler,
            lowHandler,
        });
    });


    // const highData = allPages.reduce((accum, nextPage) => {
    //     const page = nextPage.mangaPage;
    //     if (!page) {
    //         return accum;
    //     }

    //     const encryptionKey = page.encryptionKey;

    //     return accum.concat([[
    //         page.imageUrl,
    //         (pageData: string) => xorDecrypt(encryptionKey, pageData)
    //     ]]);
    // }, []);

    // const pages = highData.map(pageData => (
    //     new PageData({ highUrl: pageData[0], highHandler: pageData[1] })
    // ));

    const chapterData = new ChapterData({ pages: pageDatas });
    return chapterData;
}
