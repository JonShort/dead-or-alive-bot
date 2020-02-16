const axios = require('axios');
const qs = require('qs');
const moment = require('moment');
const wiki = require('wikidata-sdk');

const overrides = require('./Overrides');
const { WIKIDATA_ERROR } = require('./constants');

const WikiDataDateFormat = "'+'YYYY-MM-DD'T'hh:mm:ss'Z'";
const DefaultDateFormat = 'MMMM Do YYYY';

axios.interceptors.request.use((request) => {
    if (request.method === 'post' && request.headers['Content-Type'] === 'application/x-www-form-urlencoded') {
        request.data = qs.stringify(request.data);
    }
    return request;
});

const parseWikipediaUrl = (title) => {
    const parsedTitle = title
        .replace(/ /g, '_')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29');

    return `https://en.wikipedia.org/wiki/${parsedTitle}`;
};

const getEntityIds = async (searchTerm) => {
    const url = wiki.searchEntities({
        search: searchTerm,
        format: 'json',
    });

    const searchResult = await axios.get(url);

    if (searchResult.data.error) {
        throw new Error(WIKIDATA_ERROR);
    }

    if (!searchResult.data.search || searchResult.data.search.length === 0) {
        throw new Error('not-found');
    }
    return searchResult.data.search.map(entity => entity.id).slice(0, 5);
};

const getEntity = async (entityId) => {
    const entityUrl = wiki.getEntities(entityId);
    const result = await axios.get(entityUrl);
    return result.data.entities[entityId];
};

const getEntities = entityIds => Promise.all(entityIds.map(entityId => getEntity(entityId)));

const getHumanEntities = (entities) => {
    const personEntities = entities.filter((entity) => {
        if (entity.claims.P31 === undefined) return false;
        if (entity.sitelinks.enwiki === undefined) return false;

        const instanceOfValue = entity.claims.P31[0].mainsnak.datavalue.value.id;
        return instanceOfValue === 'Q5';
    });
    if (personEntities.length === 0) {
        throw new Error('not-found');
    }
    return personEntities;
};

const getFirstHumanEntity = (entities) => {
    const personEntity = entities.find((entity) => {
        if (entity.claims.P31 === undefined) return null;
        const instanceOfValue = entity.claims.P31[0].mainsnak.datavalue.value.id;
        return instanceOfValue === 'Q5';
    });
    if (personEntity === undefined || personEntity.sitelinks.enwiki === undefined) {
        throw new Error('not-found');
    }
    return personEntity;
};

const getPersonModel = (personEntity) => {
    const {
        P569: birthData,
        P570: deathData
    } = personEntity.claims;

    const name = personEntity.labels.en.value;
    const url = parseWikipediaUrl(personEntity.sitelinks.enwiki.title);
    const hasDOB = birthData !== undefined;
    const isDead = deathData !== undefined;

    let dateOfBirth = null;
    if (hasDOB) {
        const dateOfBirthString = birthData[0].mainsnak.datavalue.value.time;
        dateOfBirth = moment(dateOfBirthString, WikiDataDateFormat).toDate();
    }

    let dateOfDeath = null;
    if (isDead) {
        const dateOfDeathString = deathData[0].mainsnak.datavalue.value.time;
        dateOfDeath = moment(dateOfDeathString, WikiDataDateFormat).toDate();
    }

    return {
        name,
        dateOfBirth,
        dateOfDeath,
        url
    };
};

const getResultModel = (personModel) => {
    const hasDOB = personModel.dateOfBirth !== null;
    const isDead = personModel.dateOfDeath !== null;
    const { customMessage } = personModel;
    let age;
    let dateOfDeathFormatted = null;

    if (hasDOB) {
        const dateOfBirth = moment(personModel.dateOfBirth);
        age = moment().diff(dateOfBirth, 'years');
        if (isDead) {
            const dateOfDeath = moment(personModel.dateOfDeath);
            age = dateOfDeath.diff(dateOfBirth, 'years');
            dateOfDeathFormatted = dateOfDeath.format(DefaultDateFormat);
        }
    }

    return {
        name: personModel.name,
        age,
        hasDOB,
        isDead,
        dateOfDeath: dateOfDeathFormatted,
        url: personModel.url,
        customMessage,
    };
};

const matchSearchToOverride = (arrayOrString, searchTerm) => {
    if (typeof arrayOrString !== 'object') {
        return arrayOrString === searchTerm;
    }

    return arrayOrString.find(x => x === searchTerm);
};

const search = async (searchTerm) => {
    // search for override terms first
    const overrideModel =
        overrides.find(override =>
            matchSearchToOverride(override.overrideSearchTerm, searchTerm.toLowerCase())
        );

    if (overrideModel) return getResultModel(overrideModel);

    const entityIds = await getEntityIds(searchTerm);
    const entities = await getEntities(entityIds);
    const personEntity = getFirstHumanEntity(entities);
    const wikipediaModel = getPersonModel(personEntity);
    return getResultModel(wikipediaModel);
};

const searchQuery = async (searchTerm) => {
    const entityIds = await getEntityIds(searchTerm);
    const entities = await getEntities(entityIds);
    const humanEntities = await getHumanEntities(entities);
    return humanEntities.map(entity => getResultModel(getPersonModel(entity)));
};

module.exports = {
    search,
    searchQuery,
    _private: {
        getEntities,
        getEntity,
        getEntityIds,
        getFirstHumanEntity,
        getPersonModel,
        getResultModel,
        matchSearchToOverride,
        parseWikipediaUrl
    },
};
