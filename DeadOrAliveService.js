const axios = require("axios");
const qs = require("qs");
const cheerio = require("cheerio");
const moment = require("moment");
const wiki = require("wikidata-sdk");

axios.interceptors.request.use(request => {
    if (request.method === "post" && request.headers["Content-Type"] === "application/x-www-form-urlencoded") {
        request.data = qs.stringify(request.data);
    }
    return request;
});

class DeadOrAliveService {

    async search(searchTerm) {
        const searchUrl = wiki.searchEntities({
            search: searchTerm,
            format: "json"
        });

        // get results for search term
        const searchResult = await axios.get(searchUrl);
        if (searchResult.data.search.length === 0) {
            return null;
        }
        const entityIds = searchResult.data.search.map(entity => {
            return entity.id;
        });
        
        // get person entity from search results
        const entities = await this.getEntities(entityIds);
        const personEntity = entities.find(entity => {
            if (entity.claims.P31 === undefined) return null;
            const instanceOfValue = entity.claims.P31[0].mainsnak.datavalue.value.id;
            return instanceOfValue === "Q5";
        });
        if (!personEntity) {
            return null;
        }

        // get person info
        const name = personEntity.labels.en.value;
        const dateOfBirthString = personEntity.claims.P569[0].mainsnak.datavalue.value.time;
        const dateOfBirth = moment(dateOfBirthString, "'+'YYYY-MM-DD'T'hh:mm:ss'Z'");
        const isDead = personEntity.claims.P570 !== undefined;

        let age = null;
        let dateOfDeathFormatted = null;
        if (isDead) {
            const dateOfDeathString = personEntity.claims.P570[0].mainsnak.datavalue.value.time;
            const dateOfDeath = moment(dateOfDeathString, "'+'YYYY-MM-DD'T'hh:mm:ss'Z'")

            age = dateOfDeath.diff(dateOfBirth, "years");
            dateOfDeathFormatted = dateOfDeath.format("MMMM Do YYYY");
        } else {
            age = moment().diff(dateOfBirth, "years");
        }

        return {
            name: name,
            isDead: isDead,
            age: age,
            dateOfDeath: dateOfDeathFormatted
        };
    }
    
    async getEntities(entityIds) {
        return Promise.all(entityIds.map(async (entityId) => {
            const entityUrl = wiki.getEntities(entityId);
            return await axios.get(entityUrl)
            .then(entityResult => {
                return entityResult.data.entities[entityId];
            });
        }));
    }

}

module.exports = DeadOrAliveService;